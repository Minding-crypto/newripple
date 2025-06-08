import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const MicroloanRequest = () => {
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    const loanAmount = parseFloat(amount);
    
    if (!amount || isNaN(loanAmount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid loan amount');
      return false;
    }

    if (loanAmount <= 0) {
      Alert.alert('Invalid Amount', 'Loan amount must be greater than 0');
      return false;
    }

    if (loanAmount > 100) {
      Alert.alert('Amount Too High', 'Maximum loan amount is 100 RLUSD');
      return false;
    }

    if (loanAmount < 1) {
      Alert.alert('Amount Too Low', 'Minimum loan amount is 1 RLUSD');
      return false;
    }

    if (!purpose.trim()) {
      Alert.alert('Purpose Required', 'Please provide a purpose for the loan');
      return false;
    }

    if (purpose.trim().length < 10) {
      Alert.alert('Purpose Too Short', 'Please provide a more detailed purpose (at least 10 characters)');
      return false;
    }

    return true;
  };

  const handleSubmitRequest = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const requestAmount = parseFloat(amount);
      const requestDate = new Date();
      
      // Funding deadline: 14 days from now
      const fundingDeadline = new Date();
      fundingDeadline.setDate(fundingDeadline.getDate() + 14);
      
      
      // Due date: 21 days from now (14 days funding + 7 days repayment)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 21);

      // Create the loan request for community funding
      // Note: user_id should be set by your external authentication system
      const { data, error } = await supabase
        .from('microloans')
        .insert([
          {
            user_id: '550e8400-e29b-41d4-a716-446655440000', // Test user ID
            amount: requestAmount, // Amount borrower will receive
            target_amount: requestAmount, // Amount that needs to be funded
            funded_amount: 0, // Starting at 0
            request_date: requestDate.toISOString(),
            due_date: dueDate.toISOString(),
            funding_deadline: fundingDeadline.toISOString(),
            status: 'funding', // Open for community funding
            purpose: purpose.trim(),
            interest_rate: 0.05, // 5% interest for community funders
          },
        ])
        .select()
        .single();

      if (error) throw error;

      Alert.alert(
        'Loan Request Posted!',
        `Your microloan request for ${amount} RLUSD has been posted to the marketplace.\n\nCommunity members can now fund your loan with 5% interest returns.\n\nFunding deadline: ${fundingDeadline.toLocaleDateString()}`,
        [
          {
            text: 'View Marketplace',
            onPress: () => router.push('/loan-marketplace'),
          },
          {
            text: 'Go to Dashboard',
            onPress: () => router.push('/microloan-dashboard'),
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting loan request:', error);
      Alert.alert('Error', 'Failed to submit loan request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const calculateRepayment = () => {
    const loanAmount = parseFloat(amount);
    if (isNaN(loanAmount)) return 0;
    // Simple interest calculation (you can modify this based on your business model)
    const interestRate = 0.05; // 5% interest
    return loanAmount * (1 + interestRate);
  };



  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Request Microloan</Text>
        <Text style={styles.headerSubtitle}>
          Get quick access to funds up to 100 RLUSD
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Loan Amount Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loan Amount</Text>
          <View style={styles.amountContainer}>
            <View style={styles.currencyInputContainer}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                maxLength={6}
              />
              <Text style={styles.currencyLabel}>RLUSD</Text>
            </View>
            <Text style={styles.amountHint}>
              Minimum: 1 RLUSD • Maximum: 100 RLUSD
            </Text>
          </View>

          {amount && !isNaN(parseFloat(amount)) && (
            <View style={styles.repaymentInfo}>
              <View style={styles.repaymentRow}>
                <Text style={styles.repaymentLabel}>Loan Amount:</Text>
                <Text style={styles.repaymentValue}>{formatCurrency(amount)} RLUSD</Text>
              </View>
              <View style={styles.repaymentRow}>
                <Text style={styles.repaymentLabel}>Interest (5%):</Text>
                <Text style={styles.repaymentValue}>
                  {formatCurrency(parseFloat(amount) * 0.05)} RLUSD
                </Text>
              </View>
              <View style={styles.repaymentRow}>
                <Text style={styles.repaymentLabel}>Total Repayment:</Text>
                <Text style={[styles.repaymentValue, styles.totalAmount]}>
                  {formatCurrency(calculateRepayment())} RLUSD
                </Text>
              </View>
              <Text style={styles.dueDateText}>Due in 7 days</Text>
            </View>
          )}
        </View>

        {/* Purpose Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Purpose</Text>
          <TextInput
            style={styles.purposeInput}
            placeholder="Please describe what you will use this loan for..."
            value={purpose}
            onChangeText={setPurpose}
            multiline
            numberOfLines={4}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.characterCount}>
            {purpose.length}/500 characters
          </Text>
        </View>

        {/* Terms and Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Terms & Conditions</Text>
          <View style={styles.termsContainer}>
            <View style={styles.termItem}>
              <MaterialIcons name="schedule" size={20} color="#007bff" />
              <Text style={styles.termText}>Loan must be repaid within 7 days</Text>
            </View>
            <View style={styles.termItem}>
              <MaterialIcons name="percent" size={20} color="#007bff" />
              <Text style={styles.termText}>5% interest rate applied</Text>
            </View>
            <View style={styles.termItem}>
              <MaterialIcons name="warning" size={20} color="#ffc107" />
              <Text style={styles.termText}>Late payments may affect future loan eligibility</Text>
            </View>
            <View style={styles.termItem}>
              <MaterialIcons name="security" size={20} color="#28a745" />
              <Text style={styles.termText}>Secure processing through RLUSD blockchain</Text>
            </View>
          </View>
        </View>



        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            loading && styles.disabledButton,
            (!amount || !purpose.trim() || isNaN(parseFloat(amount))) && styles.disabledButton,
          ]}
          onPress={handleSubmitRequest}
          disabled={loading || !amount || !purpose.trim() || isNaN(parseFloat(amount))}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="send" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Request</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimerText}>
          By submitting this request, you agree to our terms and conditions and commit to repaying the loan on time.
        </Text>
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
  ineligibleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  ineligibleTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc3545',
    marginTop: 20,
    marginBottom: 12,
  },
  ineligibleText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  backButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContainer: {
    padding: 16,
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
  amountContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  currencyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#007bff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  currencyLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007bff',
  },
  amountHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  repaymentInfo: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  repaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  repaymentLabel: {
    fontSize: 14,
    color: '#666',
  },
  repaymentValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007bff',
  },
  dueDateText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  purposeInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    height: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  characterCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 8,
  },
  termsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  termItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  termText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  userInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  userInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  userInfoLabel: {
    fontSize: 14,
    color: '#666',
  },
  userInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
    fontStyle: 'italic',
  },
});

export default MicroloanRequest; 