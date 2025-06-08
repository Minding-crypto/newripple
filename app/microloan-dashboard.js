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

const MicroloanDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLoans, setCurrentLoans] = useState([]);
  const [loanHistory, setLoanHistory] = useState([]);
  const [loanStats, setLoanStats] = useState(null);
  const [hasOutstandingLoan, setHasOutstandingLoan] = useState(false);

  const fetchLoanData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch current loans (pending/approved)
      const { data: currentLoansData, error: currentLoansError } = await supabase
        .from('microloans')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false });

      if (currentLoansError) throw currentLoansError;

      // Fetch loan history (repaid/defaulted)
      const { data: historyData, error: historyError } = await supabase
        .from('microloans')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['repaid', 'defaulted'])
        .order('updated_at', { ascending: false })
        .limit(5);

      if (historyError) throw historyError;

      // Fetch loan statistics
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_user_loan_stats', { user_uuid: user.id });

      if (statsError) throw statsError;

      setCurrentLoans(currentLoansData || []);
      setLoanHistory(historyData || []);
      setLoanStats(statsData);
      setHasOutstandingLoan(currentLoansData && currentLoansData.length > 0);

    } catch (error) {
      console.error('Error fetching loan data:', error);
      Alert.alert('Error', 'Failed to load loan information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLoanData();
  }, [fetchLoanData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchLoanData();
  }, [fetchLoanData]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount).toFixed(2)} RLUSD`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ffc107';
      case 'approved': return '#28a745';
      case 'repaid': return '#17a2b8';
      case 'defaulted': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return 'hourglass-empty';
      case 'approved': return 'check-circle';
      case 'repaid': return 'payment';
      case 'defaulted': return 'warning';
      default: return 'info';
    }
  };

  const isOverdue = (dueDate) => {
    return new Date(dueDate) < new Date();
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
              fetchLoanData();
            } catch (error) {
              console.error('Error repaying loan:', error);
              Alert.alert('Error', 'Failed to mark loan as repaid');
            }
          },
        },
      ]
    );
  };

  const LoanCard = ({ loan, showActions = false }) => {
    const statusColor = getStatusColor(loan.status);
    const statusIcon = getStatusIcon(loan.status);
    const overdue = loan.status === 'approved' && isOverdue(loan.due_date);
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
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Due Date:</Text>
            <Text style={[styles.detailValue, overdue && styles.overdueText]}>
              {formatDate(loan.due_date)}
              {loan.status === 'approved' && (
                <Text style={styles.daysUntilDue}>
                  {overdue ? ` (${Math.abs(daysUntilDue)} days overdue)` : ` (${daysUntilDue} days left)`}
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
        </View>

        {showActions && loan.status === 'approved' && (
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
          <Text style={styles.statValue}>{loanStats?.total_loans || 0}</Text>
          <Text style={styles.statLabel}>Total Loans</Text>
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
          <Text style={styles.statValue}>{loanStats?.success_rate?.toFixed(1) || 0}%</Text>
          <Text style={styles.statLabel}>Success Rate</Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading loan information...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Microloan Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          Manage your microloans and repayments
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Action Buttons */}
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.primaryButton,
              hasOutstandingLoan && styles.disabledButton,
            ]}
            onPress={() => router.push('/microloan-request')}
            disabled={hasOutstandingLoan}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.actionButtonText}>Request Loan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={() => router.push('/microloan-history')}
          >
            <MaterialIcons name="history" size={24} color="#007bff" />
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>
              View History
            </Text>
          </TouchableOpacity>
        </View>

        {hasOutstandingLoan && (
          <View style={styles.warningCard}>
            <MaterialIcons name="info" size={24} color="#ffc107" />
            <Text style={styles.warningText}>
              You have an outstanding loan. You cannot request a new loan until it's repaid.
            </Text>
          </View>
        )}

        {/* Current Loans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Loans</Text>
          {currentLoans.length > 0 ? (
            currentLoans.map((loan) => (
              <LoanCard key={loan.id} loan={loan} showActions={true} />
            ))
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="account-balance-wallet" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No current loans</Text>
              <Text style={styles.emptyStateSubtext}>
                Request your first microloan to get started
              </Text>
            </View>
          )}
        </View>

        {/* Statistics */}
        {loanStats && loanStats.total_loans > 0 && <StatsCard />}

        {/* Recent History */}
        {loanHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent History</Text>
            {loanHistory.map((loan) => (
              <LoanCard key={loan.id} loan={loan} showActions={false} />
            ))}
          </View>
        )}
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
  actionButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007bff',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  secondaryButtonText: {
    color: '#007bff',
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3cd',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#856404',
  },
  section: {
    marginBottom: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  overdueText: {
    color: '#dc3545',
  },
  daysUntilDue: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  repayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 8,
  },
  repayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
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
    marginBottom: 16,
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

export default MicroloanDashboard; 