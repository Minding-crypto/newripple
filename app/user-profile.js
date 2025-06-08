import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const UserProfile = () => {
  const params = useLocalSearchParams();
  const { userId, loanId, returnTo } = params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [currentLoan, setCurrentLoan] = useState(null);
  const [loanHistory, setLoanHistory] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [fundingContributions, setFundingContributions] = useState([]);
  const [statistics, setStatistics] = useState({
    totalLoansGiven: 0,
    totalAmountFunded: 0,
    averageReturn: 0,
    successfulReturns: 0,
  });

  const fetchProfileData = useCallback(async () => {
    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Fetch current loan if loanId is provided
      if (loanId) {
        const { data: loanData, error: loanError } = await supabase
          .from('microloans')
          .select('*')
          .eq('id', loanId)
          .single();

        if (loanError) throw loanError;
        setCurrentLoan(loanData);
      }

      // Fetch loan history
      const { data: historyData, error: historyError } = await supabase
        .from('microloans')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;
      setLoanHistory(historyData || []);

      // Fetch reviews
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('user_reviews')
        .select(`
          *,
          reviewer:profiles!reviewer_id (
            id,
            full_name,
            email,
            profile_picture_url
          )
        `)
        .eq('reviewed_id', userId)
        .order('created_at', { ascending: false });

      if (reviewsError) throw reviewsError;
      setReviews(reviewsData || []);

      // Fetch funding contributions (loans this user has funded)
      const { data: contributionsData, error: contributionsError } = await supabase
        .from('loan_contributions')
        .select(`
          *,
          microloans (
            id,
            amount,
            purpose,
            status,
            user_id,
            profiles (
              full_name,
              email
            )
          )
        `)
        .eq('funder_id', userId)
        .order('contributed_at', { ascending: false });

      if (contributionsError) throw contributionsError;
      setFundingContributions(contributionsData || []);

      // Calculate funding statistics
      const totalAmountFunded = contributionsData?.reduce((sum, contrib) => sum + parseFloat(contrib.amount), 0) || 0;
      const totalReturns = contributionsData?.reduce((sum, contrib) => sum + parseFloat(contrib.actual_return), 0) || 0;
      const successfulReturns = contributionsData?.filter(contrib => contrib.status === 'repaid').length || 0;
      const averageReturn = contributionsData?.length > 0 ? (totalReturns / totalAmountFunded * 100) : 0;

      setStatistics({
        totalLoansGiven: contributionsData?.length || 0,
        totalAmountFunded,
        averageReturn,
        successfulReturns,
      });

    } catch (error) {
      console.error('Error fetching profile data:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, loanId]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfileData();
  }, [fetchProfileData]);

  const formatCurrency = (amount) => {
    return `${parseFloat(amount).toFixed(2)} RLUSD`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCredibilityColor = (score) => {
    if (score >= 4.5) return '#28a745';
    if (score >= 3.5) return '#17a2b8';
    if (score >= 2.5) return '#ffc107';
    return '#dc3545';
  };

  const getCredibilityLabel = (score) => {
    if (score >= 4.5) return 'Excellent';
    if (score >= 3.5) return 'Good';
    if (score >= 2.5) return 'Fair';
    return 'Poor';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'funding': return '#007bff';
      case 'funded': return '#17a2b8';
      case 'approved': return '#28a745';
      case 'repaid': return '#28a745';
      case 'defaulted': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const handleFundLoan = () => {
    if (currentLoan) {
      router.push({
        pathname: '/fund-loan',
        params: {
          loanId: currentLoan.id,
          loanData: JSON.stringify(currentLoan),
        },
      });
    }
  };

  const handleWriteReview = () => {
    router.push({
      pathname: '/write-review',
      params: {
        userId: userId,
        loanId: loanId,
      },
    });
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <MaterialIcons
          key={i}
          name={i <= rating ? 'star' : 'star-border'}
          size={16}
          color="#ffc107"
        />
      );
    }
    return stars;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error" size={64} color="#dc3545" />
          <Text style={styles.errorText}>Profile not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const credibilityColor = getCredibilityColor(profile.credibility_score);
  const repaymentRate = profile.total_loans_taken > 0 
    ? ((profile.loans_repaid_on_time / profile.total_loans_taken) * 100).toFixed(1)
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => returnTo ? router.push(returnTo) : router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {profile.profile_picture_url ? (
                <Image
                  source={{ uri: profile.profile_picture_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="person" size={48} color="#666" />
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {profile.full_name || profile.email}
              </Text>
              <Text style={styles.profileEmail}>{profile.email}</Text>
              {profile.bio && (
                <Text style={styles.profileBio}>{profile.bio}</Text>
              )}
            </View>
          </View>

          {/* Credibility Score */}
          <View style={styles.credibilitySection}>
            <View style={styles.credibilityHeader}>
              <Text style={styles.credibilityTitle}>Credibility Score</Text>
              <View style={styles.credibilityBadge}>
                <MaterialIcons name="star" size={20} color={credibilityColor} />
                <Text style={[styles.credibilityScore, { color: credibilityColor }]}>
                  {profile.credibility_score.toFixed(1)}
                </Text>
              </View>
            </View>
            <Text style={[styles.credibilityLabel, { color: credibilityColor }]}>
              {getCredibilityLabel(profile.credibility_score)}
            </Text>
          </View>
        </View>

        {/* Current Loan (if viewing from marketplace) */}
        {currentLoan && (
          <View style={styles.currentLoanCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Current Loan Request</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentLoan.status) }]}>
                <Text style={styles.statusText}>{currentLoan.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.loanAmount}>{formatCurrency(currentLoan.target_amount)}</Text>
            <Text style={styles.loanPurpose}>{currentLoan.purpose}</Text>
            <View style={styles.loanProgress}>
              <Text style={styles.progressText}>
                {formatCurrency(currentLoan.funded_amount)} of {formatCurrency(currentLoan.target_amount)} funded
              </Text>
              <Text style={styles.interestText}>
                {(currentLoan.interest_rate * 100).toFixed(1)}% interest return
              </Text>
            </View>
            {currentLoan.status === 'funding' && (
              <TouchableOpacity style={styles.fundButton} onPress={handleFundLoan}>
                <MaterialIcons name="account-balance-wallet" size={20} color="#fff" />
                <Text style={styles.fundButtonText}>Fund This Loan</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Statistics Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialIcons name="history" size={24} color="#007bff" />
            <Text style={styles.statValue}>{profile.total_loans_taken}</Text>
            <Text style={styles.statLabel}>Total Loans</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="check-circle" size={24} color="#28a745" />
            <Text style={styles.statValue}>{profile.loans_repaid_on_time}</Text>
            <Text style={styles.statLabel}>Repaid On Time</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="cancel" size={24} color="#dc3545" />
            <Text style={styles.statValue}>{profile.loans_defaulted}</Text>
            <Text style={styles.statLabel}>Defaulted</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="trending-up" size={24} color="#17a2b8" />
            <Text style={styles.statValue}>{repaymentRate}%</Text>
            <Text style={styles.statLabel}>Success Rate</Text>
          </View>
        </View>

        {/* Funding Activity */}
        {statistics.totalLoansGiven > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Funding Activity</Text>
            <View style={styles.fundingStats}>
              <View style={styles.fundingStat}>
                <Text style={styles.fundingValue}>{statistics.totalLoansGiven}</Text>
                <Text style={styles.fundingLabel}>Loans Funded</Text>
              </View>
              <View style={styles.fundingStat}>
                <Text style={styles.fundingValue}>{formatCurrency(statistics.totalAmountFunded)}</Text>
                <Text style={styles.fundingLabel}>Total Funded</Text>
              </View>
              <View style={styles.fundingStat}>
                <Text style={styles.fundingValue}>{statistics.successfulReturns}</Text>
                <Text style={styles.fundingLabel}>Successful Returns</Text>
              </View>
            </View>
          </View>
        )}

        {/* Loan History */}
        {loanHistory.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Loan History</Text>
            {loanHistory.slice(0, 5).map((loan) => (
              <View key={loan.id} style={styles.historyItem}>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyAmount}>{formatCurrency(loan.amount)}</Text>
                  <Text style={styles.historyPurpose} numberOfLines={1}>
                    {loan.purpose}
                  </Text>
                  <Text style={styles.historyDate}>{formatDate(loan.request_date)}</Text>
                </View>
                <View style={[styles.historyStatus, { backgroundColor: getStatusColor(loan.status) }]}>
                  <Text style={styles.historyStatusText}>{loan.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Reviews */}
        <View style={styles.sectionCard}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionTitle}>Community Reviews ({reviews.length})</Text>
            {loanId && (
              <TouchableOpacity style={styles.writeReviewButton} onPress={handleWriteReview}>
                <MaterialIcons name="rate-review" size={16} color="#007bff" />
                <Text style={styles.writeReviewText}>Write Review</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {reviews.length > 0 ? (
            reviews.slice(0, 5).map((review) => (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewerInfo}>
                    <View style={styles.reviewerAvatar}>
                      {review.reviewer.profile_picture_url ? (
                        <Image
                          source={{ uri: review.reviewer.profile_picture_url }}
                          style={styles.reviewerImage}
                        />
                      ) : (
                        <MaterialIcons name="person" size={16} color="#666" />
                      )}
                    </View>
                                      <Text style={styles.reviewerName}>
                    {review.reviewer.full_name || review.reviewer.email}
                  </Text>
                  </View>
                  <View style={styles.ratingContainer}>
                    {renderStars(review.rating)}
                  </View>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                )}
                <Text style={styles.reviewDate}>{formatDate(review.created_at)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="rate-review" size={32} color="#ccc" />
              <Text style={styles.emptyStateText}>No reviews yet</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#dc3545',
  },
  scrollContainer: {
    padding: 16,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  profileBio: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  credibilitySection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  credibilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  credibilityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  credibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credibilityScore: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  credibilityLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  currentLoanCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  loanAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  loanPurpose: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  loanProgress: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  interestText: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: '500',
  },
  fundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 12,
    borderRadius: 8,
  },
  fundButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  fundingStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  fundingStat: {
    alignItems: 'center',
  },
  fundingValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  fundingLabel: {
    fontSize: 12,
    color: '#666',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyInfo: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  historyPurpose: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  historyDate: {
    fontSize: 12,
    color: '#999',
  },
  historyStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyStatusText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  writeReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  writeReviewText: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '500',
    marginLeft: 4,
  },
  reviewItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  reviewerImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  ratingContainer: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 4,
  },
  reviewDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
});

export default UserProfile; 