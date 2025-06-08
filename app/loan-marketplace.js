import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
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

const LoanMarketplace = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loans, setLoans] = useState([]);
  const [filteredLoans, setFilteredLoans] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');

  const filterOptions = [
    { key: 'all', label: 'All Loans', icon: 'list', color: '#6c757d' },
    { key: 'funding', label: 'Funding', icon: 'trending-up', color: '#007bff' },
    { key: 'almost_funded', label: 'Almost Funded', icon: 'schedule', color: '#ffc107' },
    { key: 'high_credibility', label: 'High Credibility', icon: 'star', color: '#28a745' },
  ];

  const fetchLoans = useCallback(async () => {
    try {
      // Fetch all loans that are accepting funding with user profiles
      const { data: loansData, error: loansError } = await supabase
        .from('microloans')
        .select(`
          *,
          profiles (
            id,
            full_name,
            email,
            credibility_score,
            total_loans_taken,
            loans_repaid_on_time,
            loans_defaulted,
            profile_picture_url,
            bio,
            xrpl_address 
          )
        `)
        .eq('status', 'funding')
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      // Fetch contribution counts for each loan
      const loanIds = loansData?.map(loan => loan.id) || [];
      let contributionsData = [];
      
      if (loanIds.length > 0) {
        const { data, error: contributionsError } = await supabase
          .from('loan_contributions')
          .select('loan_id, funder_id')
          .in('loan_id', loanIds);

        if (contributionsError) throw contributionsError;
        contributionsData = data || [];
      }

      // Add contribution count to each loan
      const loansWithContributions = loansData?.map(loan => ({
        ...loan,
        contributorCount: contributionsData.filter(c => c.loan_id === loan.id).length,
        fundingProgress: ((loan.funded_amount / loan.target_amount) * 100).toFixed(1),
      })) || [];

      setLoans(loansWithContributions);
      setFilteredLoans(loansWithContributions);
    } catch (error) {
      console.error('Error fetching loans:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    filterLoans();
  }, [selectedFilter, loans]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLoans();
  }, [fetchLoans]);

  const filterLoans = () => {
    let filtered = loans;

    switch (selectedFilter) {
      case 'funding':
        filtered = loans.filter(loan => loan.funded_amount < loan.target_amount);
        break;
      case 'almost_funded':
        filtered = loans.filter(loan => 
          (loan.funded_amount / loan.target_amount) >= 0.75 && 
          loan.funded_amount < loan.target_amount
        );
        break;
      case 'high_credibility':
        filtered = loans.filter(loan => loan.profiles.credibility_score >= 4.0);
        break;
      default:
        filtered = loans;
    }

    setFilteredLoans(filtered);
  };

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

  const getProgressColor = (progress) => {
    if (progress >= 100) return '#28a745';
    if (progress >= 75) return '#17a2b8';
    if (progress >= 50) return '#ffc107';
    return '#007bff';
  };

  const handleLoanPress = (loan) => {
    router.push({
      pathname: '/user-profile',
      params: {
        userId: loan.user_id,
        loanId: loan.id,
        returnTo: '/loan-marketplace',
      },
    });
  };

  const handleFundPress = (loan) => {
    router.push({
      pathname: '/fund-loan',
      params: {
        loanId: loan.id,
        loanData: JSON.stringify(loan),
      },
    });
  };

  const FilterButton = ({ option, isSelected, onPress }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        isSelected && styles.selectedFilterButton,
        isSelected && { backgroundColor: option.color },
      ]}
      onPress={onPress}
    >
      <MaterialIcons
        name={option.icon}
        size={18}
        color={isSelected ? '#fff' : option.color}
      />
      <Text
        style={[
          styles.filterButtonText,
          isSelected && styles.selectedFilterButtonText,
        ]}
      >
        {option.label}
      </Text>
    </TouchableOpacity>
  );

  const LoanCard = ({ loan }) => {
    const progress = parseFloat(loan.fundingProgress);
    const progressColor = getProgressColor(progress);
    const credibilityColor = getCredibilityColor(loan.profiles.credibility_score);
    const remainingAmount = loan.target_amount - loan.funded_amount;
    const daysLeft = Math.max(0, Math.ceil((new Date(loan.funding_deadline) - new Date()) / (1000 * 60 * 60 * 24)));

    return (
      <View style={styles.loanCard}>
        {/* Loan Header */}
        <TouchableOpacity onPress={() => handleLoanPress(loan)}>
          <View style={styles.loanHeader}>
            <View style={styles.userInfo}>
              <View style={styles.userAvatar}>
                {loan.profiles.profile_picture_url ? (
                  <Image
                    source={{ uri: loan.profiles.profile_picture_url }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <MaterialIcons name="person" size={24} color="#666" />
                )}
              </View>
              <View style={styles.userDetails}>
                <Text style={styles.userName}>
                  {loan.profiles.full_name || loan.profiles.email}
                </Text>
                <View style={styles.credibilityContainer}>
                  <MaterialIcons name="star" size={16} color={credibilityColor} />
                  <Text style={[styles.credibilityScore, { color: credibilityColor }]}>
                    {loan.profiles.credibility_score.toFixed(1)} ({getCredibilityLabel(loan.profiles.credibility_score)})
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.loanAmount}>
              <Text style={styles.amountText}>{formatCurrency(loan.target_amount)}</Text>
              <Text style={styles.interestText}>{(loan.interest_rate * 100).toFixed(1)}% Interest</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Loan Details */}
        <View style={styles.loanDetails}>
          <Text style={styles.purposeTitle}>Purpose:</Text>
          <Text style={styles.purposeText} numberOfLines={2}>
            {loan.purpose}
          </Text>
        </View>

        {/* Progress Section */}
        <View style={styles.progressSection}>
          <View style={styles.progressInfo}>
            <Text style={styles.progressLabel}>Funding Progress</Text>
            <Text style={styles.progressPercentage}>{progress}%</Text>
          </View>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { backgroundColor: progressColor, width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <View style={styles.fundingDetails}>
            <Text style={styles.fundedAmount}>
              {formatCurrency(loan.funded_amount)} raised
            </Text>
            <Text style={styles.remainingAmount}>
              {formatCurrency(remainingAmount)} remaining
            </Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialIcons name="people" size={16} color="#666" />
            <Text style={styles.statText}>{loan.contributorCount} funders</Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="schedule" size={16} color="#666" />
            <Text style={styles.statText}>{daysLeft} days left</Text>
          </View>
          <View style={styles.statItem}>
            <MaterialIcons name="history" size={16} color="#666" />
            <Text style={styles.statText}>
              {loan.profiles.loans_repaid_on_time}/{loan.profiles.total_loans_taken} repaid
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.viewProfileButton}
            onPress={() => handleLoanPress(loan)}
          >
            <MaterialIcons name="person" size={18} color="#007bff" />
            <Text style={styles.viewProfileText}>View Profile</Text>
          </TouchableOpacity>
          
          {remainingAmount > 0 && (
            <TouchableOpacity
              style={styles.fundButton}
              onPress={() => handleFundPress(loan)}
            >
              <MaterialIcons name="account-balance-wallet" size={18} color="#fff" />
              <Text style={styles.fundText}>Fund Loan</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading loan marketplace...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loan Marketplace</Text>
        <Text style={styles.headerSubtitle}>
          Fund community loans and earn returns
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Filter Buttons */}
        <View style={styles.filtersContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filtersRow}>
              {filterOptions.map((option) => (
                <FilterButton
                  key={option.key}
                  option={option}
                  isSelected={selectedFilter === option.key}
                  onPress={() => setSelectedFilter(option.key)}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Loans List */}
        <View style={styles.loansSection}>
          <Text style={styles.sectionTitle}>
            Available Loans ({filteredLoans.length})
          </Text>

          {filteredLoans.length > 0 ? (
            filteredLoans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="search" size={64} color="#ccc" />
              <Text style={styles.emptyStateText}>No loans found</Text>
              <Text style={styles.emptyStateSubtext}>
                {selectedFilter === 'all' 
                  ? 'No loans are currently seeking funding'
                  : 'No loans match the selected filter'
                }
              </Text>
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
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
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
  scrollContainer: {
    padding: 16,
  },
  filtersContainer: {
    marginBottom: 20,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  selectedFilterButton: {
    borderColor: 'transparent',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  selectedFilterButtonText: {
    color: '#fff',
  },
  loansSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  loanCard: {
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
  loanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  credibilityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credibilityScore: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  loanAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  interestText: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
  loanDetails: {
    marginBottom: 16,
  },
  purposeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  purposeText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    color: '#666',
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#e9ecef',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  fundingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fundedAmount: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
  remainingAmount: {
    fontSize: 12,
    color: '#dc3545',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  viewProfileButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007bff',
  },
  viewProfileText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '600',
    marginLeft: 6,
  },
  fundButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#28a745',
  },
  fundText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default LoanMarketplace; 