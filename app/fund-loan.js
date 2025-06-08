import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { createLoanEscrow } from '../lib/xumm';

const FundLoan = () => {
  const params = useLocalSearchParams();
  const { loanId, loanData } = params;
  const { user, profile } = useAuth();
  const loanDetails = JSON.parse(loanData);

  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loan, setLoan] = useState(null);
  const [fundingAmount, setFundingAmount] = useState('');
  const [userBalance, setUserBalance] = useState(0);
  const [contributions, setContributions] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const [xrpBalances, setXrpBalances] = useState({ xrp: 0, rlusd: 0 });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentQR, setPaymentQR] = useState(null);
  const [paymentDeeplink, setPaymentDeeplink] = useState(null);
  const [paymentUuid, setPaymentUuid] = useState(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentCurrency, setPaymentCurrency] = useState('XRP'); // Always XRP now for simplicity
  const [conversionRate, setConversionRate] = useState(0.5); // XRP to RLUSD rate (example: 1 XRP = 0.5 RLUSD)
  const [showConversionDetails, setShowConversionDetails] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadInitialData = async () => {
      setPageLoading(true);
      if (loanData) {
        setLoan(JSON.parse(loanData));
      }
      await fetchUserProfile();
      await fetchContributions();
      await fetchConversionRate();
      setPageLoading(false);
    };

    if (user?.id) {
        loadInitialData();
    }
  }, [loanData, loanId, user]);

  const fetchUserProfile = async () => {
    try {
      if (!user?.id) {
        console.log('No authenticated user found');
        return;
      }
      
      console.log('Fetching profile for user:', user.id);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      setUserProfile(data);
      setUserBalance(data?.rlusd_balance || 0);

      // If user has XRP wallet connected, fetch live balances
      if (data?.xrpl_address) {
        fetchXRPBalances(data.xrpl_address);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchXRPBalances = async (xrpAddress) => {
    try {
      // Get XRP balance using direct XRPL call
      const getXRPBalance = async () => {
        try {
          const res = await fetch('https://s.altnet.rippletest.net:51234', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              method: 'account_info',
              params: [
                {
                  account: xrpAddress,
                  ledger_index: 'validated',
                },
              ],
            }),
          });

          const json = await res.json();
          if (json.result?.account_data?.Balance) {
            const balanceDrops = json.result.account_data.Balance;
            return parseFloat(balanceDrops) / 1_000_000;
          }
          return 0;
        } catch (error) {
          console.error('Error fetching XRP balance:', error);
          return 0;
        }
      };

      // Get RLUSD balance using direct XRPL call
      const getRLUSDBalance = async () => {
        try {
          const res = await fetch('https://s.altnet.rippletest.net:51234', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              method: 'account_lines',
              params: [
                {
                  account: xrpAddress,
                  ledger_index: 'validated',
                },
              ],
            }),
          });

          const json = await res.json();
          if (json.result?.lines) {
            // Look for RLUSD trust line
            const rlusdLine = json.result.lines.find(
              line => line.currency === 'RLUSD' && line.account === 'rMxCkbh5KuWq3gF9W8K1HNu5cDLygjkT3Q'
            );
            return rlusdLine ? parseFloat(rlusdLine.balance) : 0;
          }
          return 0;
        } catch (error) {
          console.error('Error fetching RLUSD balance:', error);
          return 0;
        }
      };

      // Fetch both balances
      const [xrpBalance, rlusdBalance] = await Promise.all([
        getXRPBalance(),
        getRLUSDBalance(),
      ]);

      setXrpBalances({
        xrp: xrpBalance,
        rlusd: rlusdBalance,
      });

      console.log(`Fund-loan updated balances - XRP: ${xrpBalance}, RLUSD: ${rlusdBalance}`);
    } catch (error) {
      console.error('Error fetching XRP balances:', error);
    }
  };

  const fetchContributions = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_contributions')
        .select(`
          *,
          profiles (
            full_name,
            email,
            profile_picture_url
          )
        `)
        .eq('loan_id', loanId)
        .order('contributed_at', { ascending: false });

      if (error) throw error;
      setContributions(data || []);
    } catch (error) {
      console.error('Error fetching contributions:', error);
    }
  };

  const validateFunding = () => {
    const amount = parseFloat(fundingAmount);
    
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid funding amount');
      return false;
    }

    // Check if user has XRP wallet connected
    if (!userProfile?.xrpl_address) {
      Alert.alert(
        'Wallet Required', 
        'Please connect your XRP wallet to fund loans',
        [
          {
            text: 'Connect Wallet',
            onPress: () => router.push('/profile'),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return false;
    }

    // Calculate XRP amount needed (always pay in XRP)
    const xrpAmount = paymentCurrency === 'XRP' ? calculateXRPNeeded(amount) : amount / conversionRate;
    const availableXRP = xrpBalances.xrp;
    
    if (xrpAmount > availableXRP) {
      const shortfall = xrpAmount - availableXRP;
      Alert.alert(
        'Insufficient XRP Balance', 
        `You need ${xrpAmount.toFixed(6)} XRP but only have ${availableXRP.toFixed(6)} XRP.\nShortfall: ${shortfall.toFixed(6)} XRP\n\n(This will fund ${amount} RLUSD equivalent to the loan)`
      );
      return false;
    }

    const remainingAmount = loan.target_amount - loan.funded_amount;
    if (amount > remainingAmount) {
      Alert.alert(
        'Amount Too High', 
        `Maximum funding amount is ${formatCurrency(remainingAmount)}`
      );
      return false;
    }

    if (amount < 1) {
      Alert.alert('Minimum Amount', 'Minimum funding amount is 1 RLUSD');
      return false;
    }

    return true;
  };

  const handleFundLoan = async () => {
    console.log('=== FUND LOAN CLICKED ===');
    console.log('User:', user);
    console.log('Profile:', profile);
    console.log('Amount:', fundingAmount);
    console.log('Loan ID:', loanId);
    console.log('Full Loan Object:', JSON.stringify(loan, null, 2));

    if (!user) {
      Alert.alert('Authentication Error', 'You must be logged in to fund a loan');
      return;
    }

    if (!validateFunding()) {
      return;
    }

    setLoading(true);

    try {
      const amountToFund = parseFloat(fundingAmount);
      
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        throw new Error('User is not authenticated');
      }

      console.log(`Creating loan escrow for ${amountToFund} RLUSD.`);

      // Use the existing createLoanEscrow function from lib/xumm.js
      const result = await createLoanEscrow(
        loanId,
        amountToFund,
        userProfile.xrpl_address,
        user.id
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create payment request');
      }
      
      console.log('XUMM payment request created:', result);
      
      // Open XUMM for user to sign
      setPaymentUuid(result.uuid);
      setPaymentQR(result.qr);
      setPaymentDeeplink(result.deeplink);
      setShowPaymentModal(true);

      // Start polling for payment status
      pollForPaymentResult(result.uuid);

    } catch (err) {
      console.error('Funding error:', err);
      Alert.alert('Funding Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const pollForPaymentResult = async (uuid) => {
    // ... existing code ...
  };

  const openInXumm = () => {
    if (paymentDeeplink) {
      Linking.openURL(paymentDeeplink).catch(err => {
        console.error('Error opening Xumm:', err);
        Alert.alert('Error', 'Could not open Xumm app. Please make sure it is installed.');
      });
    }
  };

  const formatCurrency = (amount) => {
    return `${parseFloat(amount).toFixed(2)} RLUSD`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateExpectedReturn = () => {
    const amount = parseFloat(fundingAmount);
    if (!amount || !loan) return 0;
    return amount * (1 + loan.interest_rate);
  };

  const calculateProfit = () => {
    const amount = parseFloat(fundingAmount);
    if (!amount || !loan) return 0;
    return amount * loan.interest_rate;
  };

  // XRP to RLUSD conversion functions
  const fetchConversionRate = async () => {
    try {
      // In a real app, you'd fetch this from a DEX or price oracle
      // For now, using a simulated rate
      const simulatedRate = 0.5 + (Math.random() * 0.1 - 0.05); // 0.45 - 0.55 range
      setConversionRate(simulatedRate);
      return simulatedRate;
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
      return 0.5; // fallback rate
    }
  };

  const calculateXRPNeeded = (rlusdAmount) => {
    return rlusdAmount / conversionRate;
  };

  const calculateRLUSDFromXRP = (xrpAmount) => {
    return xrpAmount * conversionRate;
  };

  const getPaymentCurrencyBalance = () => {
    if (paymentCurrency === 'XRP') {
      return xrpBalances.xrp;
    }
    return userProfile?.xrpl_address ? xrpBalances.rlusd : userBalance;
  };

  const getCurrencySymbol = (currency) => {
    return currency === 'XRP' ? 'XRP' : 'RLUSD';
  };

  if (pageLoading || !loan) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading loan details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const remainingAmount = loan.target_amount - loan.funded_amount;
  const fundingProgress = ((loan.funded_amount / loan.target_amount) * 100).toFixed(1);
  const expectedReturn = calculateExpectedReturn();
  const profit = calculateProfit();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fund Loan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Loan Overview */}
        <View style={styles.loanCard}>
          <View style={styles.loanHeader}>
            <Text style={styles.loanTitle}>Loan Overview</Text>
            <Text style={styles.loanAmount}>{formatCurrency(loan.target_amount)}</Text>
          </View>
          
          <Text style={styles.purposeTitle}>Purpose:</Text>
          <Text style={styles.purposeText}>{loan.purpose}</Text>

          {/* Progress Section */}
          <View style={styles.progressSection}>
            <View style={styles.progressInfo}>
              <Text style={styles.progressLabel}>Funding Progress</Text>
              <Text style={styles.progressPercentage}>{fundingProgress}%</Text>
            </View>
            <View style={styles.progressBarContainer}>
              <View 
                style={[
                  styles.progressBar, 
                  { width: `${Math.min(parseFloat(fundingProgress), 100)}%` }
                ]} 
              />
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

          {/* Interest Information */}
          <View style={styles.interestSection}>
            <View style={styles.interestInfo}>
              <MaterialIcons name="trending-up" size={20} color="#28a745" />
              <Text style={styles.interestText}>
                {(loan.interest_rate * 100).toFixed(1)}% Interest Return
              </Text>
            </View>
            <Text style={styles.interestDescription}>
              You'll earn {(loan.interest_rate * 100).toFixed(1)}% return on your investment when the loan is repaid
            </Text>
          </View>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <MaterialIcons name="account-balance-wallet" size={24} color="#007bff" />
            <Text style={styles.balanceTitle}>
              {userProfile?.xrpl_address ? 'XRP Wallet Balance' : 'Your Balance'}
            </Text>
          </View>
          
          {userProfile?.xrpl_address ? (
            <View style={styles.xrpBalancesContainer}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>RLUSD:</Text>
                <Text style={styles.balanceAmount}>{formatCurrency(xrpBalances.rlusd)}</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>XRP:</Text>
                <Text style={styles.xrpAmount}>{xrpBalances.xrp.toFixed(6)} XRP</Text>
              </View>
              <TouchableOpacity 
                style={styles.refreshButton}
                onPress={() => fetchXRPBalances(userProfile.xrpl_address)}
              >
                <MaterialIcons name="refresh" size={14} color="#007bff" />
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.balanceAmount}>{formatCurrency(userBalance)}</Text>
              <TouchableOpacity 
                style={styles.connectWalletHint}
                onPress={() => router.push('/profile')}
              >
                <MaterialIcons name="link" size={14} color="#007bff" />
                <Text style={styles.connectWalletText}>Connect XRP Wallet for live balance</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Funding Form */}
        <View style={styles.fundingCard}>
          <Text style={styles.fundingTitle}>Fund This Loan</Text>
          
          {/* Payment Method Info */}
          {userProfile?.xrpl_address && (
            <View style={styles.currencySelection}>
              <Text style={styles.currencyLabel}>Payment Method: XRP</Text>
              <View style={styles.paymentInfo}>
                <MaterialIcons name="info" size={16} color="#007bff" />
                <Text style={styles.paymentInfoText}>
                  All payments are made in XRP. The borrower will receive the equivalent value for their loan.
                </Text>
              </View>
              <View style={styles.xrpBalanceDisplay}>
                <MaterialIcons name="account-balance-wallet" size={16} color="#ff9500" />
                <Text style={styles.balanceText}>Available: {xrpBalances.xrp.toFixed(6)} XRP</Text>
              </View>
            </View>
          )}

          {/* Conversion Info */}
          {userProfile?.xrpl_address && (
            <View style={styles.conversionInfo}>
              <View style={styles.conversionHeader}>
                <MaterialIcons name="swap-horiz" size={16} color="#007bff" />
                <Text style={styles.conversionText}>
                  Rate: 1 XRP = {conversionRate.toFixed(3)} RLUSD equivalent
                </Text>
              </View>
              
              {fundingAmount && parseFloat(fundingAmount) > 0 && (
                <View style={styles.conversionDetails}>
                  <Text style={styles.conversionNote}>
                    You'll pay {calculateXRPNeeded(parseFloat(fundingAmount)).toFixed(6)} XRP for {fundingAmount} RLUSD worth of loan funding
                  </Text>
                </View>
              )}
            </View>
          )}
          
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              Funding Amount (RLUSD equivalent)
              {fundingAmount && (
                <Text style={styles.xrpEquivalent}>
                  {' '}≈ {calculateXRPNeeded(parseFloat(fundingAmount) || 0).toFixed(6)} XRP
                </Text>
              )}
            </Text>
            <TextInput
              style={styles.amountInput}
              value={fundingAmount}
              onChangeText={setFundingAmount}
              placeholder="Enter amount to fund"
              keyboardType="numeric"
              maxLength={10}
            />
            
            {/* Quick Amount Buttons */}
            <View style={styles.quickAmounts}>
              {[10, 25, 50, Math.min(100, remainingAmount)].map(amount => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickAmountButton}
                  onPress={() => setFundingAmount(amount.toString())}
                  disabled={amount > userBalance}
                >
                  <Text 
                    style={[
                      styles.quickAmountText,
                      amount > userBalance && styles.disabledText
                    ]}
                  >
                    {amount}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Calculation Display */}
          {fundingAmount && parseFloat(fundingAmount) > 0 && (
            <View style={styles.calculationSection}>
              <Text style={styles.calculationTitle}>Investment Summary</Text>
              <View style={styles.calculationRow}>
                <Text style={styles.calculationLabel}>Your Investment:</Text>
                <Text style={styles.calculationValue}>{formatCurrency(fundingAmount)}</Text>
              </View>
              <View style={styles.calculationRow}>
                <Text style={styles.calculationLabel}>Expected Return:</Text>
                <Text style={[styles.calculationValue, styles.returnValue]}>
                  {formatCurrency(expectedReturn)}
                </Text>
              </View>
              <View style={styles.calculationRow}>
                <Text style={styles.calculationLabel}>Your Profit:</Text>
                <Text style={[styles.calculationValue, styles.profitValue]}>
                  +{formatCurrency(profit)}
                </Text>
              </View>
            </View>
          )}

          {/* Fund Button */}
          <TouchableOpacity
            style={[
              styles.fundButton,
              (loading || paymentProcessing || !userProfile) && styles.disabledButton
            ]}
            onPress={handleFundLoan}
            disabled={loading || paymentProcessing || !fundingAmount || parseFloat(fundingAmount) <= 0 || !userProfile}
          >
            {(loading || paymentProcessing) ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons 
                  name={userProfile?.xrpl_address ? "payment" : "account-balance-wallet"} 
                  size={20} 
                  color="#fff" 
                />
                <Text style={styles.fundButtonText}>
                  {userProfile?.xrpl_address 
                    ? `Pay with ${paymentCurrency}${paymentCurrency === 'XRP' ? ' (Convert to RLUSD)' : ''}` 
                    : 'Fund Loan'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Contributors List */}
        {contributions.length > 0 && (
          <View style={styles.contributorsCard}>
            <Text style={styles.contributorsTitle}>
              Recent Contributors ({contributions.length})
            </Text>
            {contributions.slice(0, 5).map((contribution) => (
              <View key={contribution.id} style={styles.contributorItem}>
                <View style={styles.contributorInfo}>
                  <View style={styles.contributorAvatar}>
                    <MaterialIcons name="person" size={16} color="#666" />
                  </View>
                  <Text style={styles.contributorName}>
                    {contribution.profiles.full_name || contribution.profiles.email}
                  </Text>
                </View>
                <View style={styles.contributionDetails}>
                  <Text style={styles.contributionAmount}>
                    {formatCurrency(contribution.amount)}
                  </Text>
                  <Text style={styles.contributionDate}>
                    {formatDate(contribution.contributed_at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Risk Disclaimer */}
        <View style={styles.disclaimerCard}>
          <View style={styles.disclaimerHeader}>
            <MaterialIcons name="warning" size={20} color="#ffc107" />
            <Text style={styles.disclaimerTitle}>Investment Risk</Text>
          </View>
          <Text style={styles.disclaimerText}>
            Microloan investments carry risk. Returns are not guaranteed and depend on the borrower's ability to repay. 
            Only invest amounts you can afford to lose.
          </Text>
        </View>
      </ScrollView>

      {/* Payment Modal */}
      <Modal
        visible={showPaymentModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Complete Payment</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowPaymentModal(false)}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.paymentTitle}>RLUSD Payment</Text>
            <Text style={styles.paymentAmount}>
              {formatCurrency(fundingAmount)}
            </Text>
            
            <Text style={styles.instructionsText}>
              Scan this QR code with your Xumm app or tap the button below to open Xumm directly.
            </Text>

            {paymentQR && (
              <View style={styles.qrContainer}>
                <QRCode value={paymentQR} size={200} />
              </View>
            )}

            <TouchableOpacity style={styles.openXummButton} onPress={openInXumm}>
              <MaterialIcons name="open-in-new" size={20} color="#fff" />
              <Text style={styles.openXummText}>Open in Xumm</Text>
            </TouchableOpacity>

            <Text style={styles.waitingText}>
              Waiting for payment confirmation...
            </Text>

            <ActivityIndicator size="large" color="#007bff" />
          </View>
        </SafeAreaView>
      </Modal>
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
  scrollContainer: {
    padding: 16,
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
    alignItems: 'center',
    marginBottom: 16,
  },
  loanTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loanAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007bff',
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
    marginBottom: 16,
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
    backgroundColor: '#007bff',
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
  interestSection: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
  },
  interestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  interestText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#28a745',
    marginLeft: 8,
  },
  interestDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  balanceCard: {
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
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  balanceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff',
  },
  xrpBalancesContainer: {
    gap: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
  },
  xrpAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff9500',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  refreshText: {
    fontSize: 12,
    color: '#007bff',
  },
  connectWalletHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  connectWalletText: {
    fontSize: 12,
    color: '#007bff',
  },
  fundingCard: {
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
  fundingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  inputSection: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007bff',
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '500',
  },
  disabledText: {
    color: '#ccc',
  },
  calculationSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  calculationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calculationLabel: {
    fontSize: 14,
    color: '#666',
  },
  calculationValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  returnValue: {
    color: '#007bff',
  },
  profitValue: {
    color: '#28a745',
  },
  fundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 12,
    borderRadius: 8,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  fundButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  contributorsCard: {
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
  contributorsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  contributorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contributorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contributorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  contributorName: {
    fontSize: 14,
    color: '#333',
  },
  contributionDetails: {
    alignItems: 'flex-end',
  },
  contributionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
  },
  contributionDate: {
    fontSize: 12,
    color: '#666',
  },
  disclaimerCard: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  disclaimerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginLeft: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#856404',
    lineHeight: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
    alignItems: 'center',
    padding: 40,
    gap: 24,
  },
  paymentTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  paymentAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007bff',
    textAlign: 'center',
  },
  instructionsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  openXummButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  openXummText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  waitingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Currency Selection Styles
  currencySelection: {
    marginBottom: 16,
  },
  currencyLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  currencyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  currencyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    gap: 8,
  },
  currencyButtonActive: {
    backgroundColor: '#007bff',
    borderColor: '#007bff',
  },
  currencyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  currencyButtonTextActive: {
    color: '#fff',
  },
  currencyBalance: {
    fontSize: 12,
    color: '#666',
  },
  currencyBalanceActive: {
    color: '#bde0ff',
  },
  // Conversion Info Styles
  conversionInfo: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  conversionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conversionText: {
    fontSize: 14,
    color: '#007bff',
    fontWeight: '500',
    flex: 1,
  },
  conversionDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  conversionNote: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  conversionCalculation: {
    backgroundColor: '#e7f3ff',
    borderRadius: 6,
    padding: 8,
  },
  conversionCalcText: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '500',
    textAlign: 'center',
  },
  xrpEquivalent: {
    fontSize: 12,
    color: '#ff9500',
    fontWeight: '500',
  },
});

export default FundLoan; 