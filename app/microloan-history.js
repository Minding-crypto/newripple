import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const MicroloanHistory = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loans, setLoans] = useState([]);
  const [filteredLoans, setFilteredLoans] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loanStats, setLoanStats] = useState(null);

  const filterOptions = [
    { key: 'all', label: 'All', icon: 'list', color: '#6c757d' },
    { key: 'pending', label: 'Pending', icon: 'hourglass-empty', color: '#ffc107' },
    { key: 'approved', label: 'Approved', icon: 'check-circle', color: '#28a745' },
    { key: 'repaid', label: 'Repaid', icon: 'payment', color: '#17a2b8' },
    { key: 'defaulted', label: 'Defaulted', icon: 'warning', color: '#dc3545' },
  ];

  const fetchLoanHistory = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch all loans for the user
      const { data: loansData, error: loansError } = await supabase
        .from('microloans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      // Fetch loan statistics
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_user_loan_stats', { user_uuid: user.id });

      if (statsError) throw statsError;

      setLoans(loansData || []);
      setFilteredLoans(loansData || []);
      setLoanStats(statsData);
    } catch (error) {
      console.error('Error fetching loan history:', error);
      Alert.alert('Error', 'Failed to load loan history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLoanHistory();
  }, [fetchLoanHistory]);

  useEffect(() => {
    filterLoans();
  }, [selectedFilter, loans]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLoanHistory();
  }, [fetchLoanHistory]);

  const filterLoans = () => {
    if (selectedFilter === 'all') {
      setFilteredLoans(loans);
    } else {
      setFilteredLoans(loans.filter(loan => loan.status === selectedFilter));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount).toFixed(2)} RLUSD`;
  };

  const getStatusColor = (status) => {
    const option = filterOptions.find(opt => opt.key === status);
    return option ? option.color : '#6c757d';
  };

  const getStatusIcon = (status) => {
    const option = filterOptions.find(opt => opt.key === status);
    return option ? option.icon : 'info';
  };

  const isOverdue = (dueDate, status) => {
    return status === 'approved' && new Date(dueDate) < new Date();
  };

  const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleRepayLoan = async (loanId) => {
    Alert.alert(
      'Confirm Repayment',
      'Are you sure you want to mark this loan as repaid?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('microloans')
                .update({
                  status: 'repaid',
                  repaid_date: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', loanId);

              if (error) throw error;

              Alert.alert('Success', 'Loan marked as repaid!');
              fetchLoanHistory();
            } catch (error) {
              console.error('Error repaying loan:', error);
              Alert.alert('Error', 'Failed to mark loan as repaid');
            }
          },
        },
      ]
    );
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
      {option.key !== 'all' && (
        <View style={[styles.filterBadge, { backgroundColor: option.color }]}>
          <Text style={styles.filterBadgeText}>
            {loans.filter(loan => loan.status === option.key).length}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const LoanCard = ({ loan }) => {
    const statusColor = getStatusColor(loan.status);
    const statusIcon = getStatusIcon(loan.status);
    const overdue = isOverdue(loan.due_date, loan.status);
    const daysUntilDue = getDaysUntilDue(loan.due_date);

    return (
      <View style={[styles.loanCard, overdue && styles.overdueCard]}>
        <View style={styles.loanHeader}>
          <View style={styles.loanInfo}>
            <Text style={styles.loanAmount}>{formatCurrency(loan.amount)}</Text>
            <Text style={styles.loanDate}>
              Requested: {formatDate(loan.request_date)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <MaterialIcons name={statusIcon} size={16} color="#fff" />
            <Text style={styles.statusText}>{loan.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.loanDetails}>
          {loan.purpose && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Purpose:</Text>
              <Text style={styles.purposeText}>{loan.purpose}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due Date:</Text>
            <Text style={[styles.detailValue, overdue && styles.overdueText]}>
              {formatDate(loan.due_date)}
              {loan.status === 'approved' && (
                <Text style={styles.daysUntilDue}>
                  {overdue
                    ? ` (${Math.abs(daysUntilDue)} days overdue)`
                    : ` (${daysUntilDue} days left)`}
                </Text>
              )}
            </Text>
          </View>

          {loan.approved_date && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Approved:</Text>
              <Text style={styles.detailValue}>{formatDate(loan.approved_date)}</Text>
            </View>
          )}

          {loan.repaid_date && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Repaid:</Text>
              <Text style={styles.detailValue}>{formatDate(loan.repaid_date)}</Text>
            </View>
          )}

          {/* Interest and Total Calculation */}
          <View style={styles.calculationContainer}>
            <View style={styles.calculationRow}>
              <Text style={styles.calculationLabel}>Interest (5%):</Text>
              <Text style={styles.calculationValue}>
                {formatCurrency(parseFloat(loan.amount) * 0.05)}
              </Text>
            </View>
            <View style={styles.calculationRow}>
              <Text style={[styles.calculationLabel, styles.totalLabel]}>Total Due:</Text>
              <Text style={[styles.calculationValue, styles.totalValue]}>
                {formatCurrency(parseFloat(loan.amount) * 1.05)}
              </Text>
            </View>
          </View>
        </View>

        {loan.status === 'approved' && (
          <TouchableOpacity
            style={styles.repayButton}
            onPress={() => handleRepayLoan(loan.id)}
          >
            <MaterialIcons name="payment" size={20} color="#fff" />
            <Text style={styles.repayButtonText}>Mark as Repaid</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const StatsCard = () => (
    <View style={styles.statsCard}>
      <Text style={styles.statsTitle}>Loan Statistics</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{loans.length}</Text>
          <Text style={styles.statLabel}>Total Requests</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{loanStats?.repaid_loans || 0}</Text>
          <Text style={styles.statLabel}>Repaid</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{loanStats?.defaulted_loans || 0}</Text>
          <Text style={styles.statLabel}>Defaulted</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: getSuccessRateColor(loanStats?.success_rate) }]}>
            {loanStats?.success_rate?.toFixed(1) || 0}%
          </Text>
          <Text style={styles.statLabel}>Success Rate</Text>
        </View>
      </View>
    </View>
  );

  const getSuccessRateColor = (rate) => {
    if (!rate) return '#6c757d';
    if (rate >= 80) return '#28a745';
    if (rate >= 60) return '#ffc107';
    return '#dc3545';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading loan history...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loan History</Text>
        <Text style={styles.headerSubtitle}>
          View and manage all your microloan requests
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Statistics */}
        {loanStats && loans.length > 0 && <StatsCard />}

        {/* Filter Buttons */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filtersTitle}>Filter by Status</Text>
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
            {selectedFilter === 'all' ? 'All Loans' : 
             `${filterOptions.find(f => f.key === selectedFilter)?.label} Loans`}
            {' '}({filteredLoans.length})
          </Text>

          {filteredLoans.length > 0 ? (
            filteredLoans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} />
            ))
          ) : loans.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="account-balance-wallet" size={64} color="#ccc" />
              <Text style={styles.emptyStateText}>No loan history</Text>
              <Text style={styles.emptyStateSubtext}>
                You haven't requested any microloans yet
              </Text>
              <TouchableOpacity
                style={styles.requestLoanButton}
                onPress={() => router.push('/microloan-request')}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.requestLoanButtonText}>Request Your First Loan</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="filter-list" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No loans found</Text>
              <Text style={styles.emptyStateSubtext}>
                No loans match the selected filter
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
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  filtersContainer: {
    marginBottom: 20,
  },
  filtersTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
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
  filterBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
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
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  overdueCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#dc3545',
  },
  loanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  loanInfo: {
    flex: 1,
  },
  loanAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  loanDate: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 4,
  },
  loanDetails: {
    marginBottom: 12,
  },
  detailRow: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  purposeText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  overdueText: {
    color: '#dc3545',
  },
  daysUntilDue: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  calculationContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  calculationLabel: {
    fontSize: 13,
    color: '#666',
  },
  calculationValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  totalLabel: {
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontWeight: 'bold',
    color: '#007bff',
  },
  repayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  repayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
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
    marginBottom: 24,
  },
  requestLoanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  requestLoanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
});

export default MicroloanHistory; 