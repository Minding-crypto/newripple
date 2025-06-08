import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const SendMoney = () => {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMoney = async () => {
    if (!recipientEmail || !amount) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get recipient user 
      const { data: recipientData, error: recipientError } = await supabase
        .from('profiles')
        .select('id, rlusd_balance')
        .eq('email', recipientEmail)
        .single();

      if (recipientError || !recipientData) {
        throw new Error('Recipient not found');
      }

      // Get sender's balance
      const { data: senderData, error: senderError } = await supabase
        .from('profiles')
        .select('rlusd_balance')
        .eq('id', user.id)
        .single();

      if (senderError || !senderData) {
        throw new Error('Could not fetch your balance');
      }

      const transferAmount = parseFloat(amount);
      if (senderData.rlusd_balance < transferAmount) {
        throw new Error('Insufficient RLUSD balance');
      }

      // Start transaction
      const { error: transferError } = await supabase.rpc('transfer_rlusd', {
        recipient_email: recipientEmail,
        amount: transferAmount,
        note: note || 'RLUSD Transfer'
      });

      if (transferError) throw transferError;

      Alert.alert('Success', 'RLUSD sent successfully!');
      router.back();
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Send RLUSD</Text>
      <TouchableOpacity onPress={() => router.push('/features')}>
  <Text style={styles.title}>Auth</Text>
</TouchableOpacity>
      <View style={styles.formContainer}>
        <Text style={styles.label}>Recipient Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter recipient's email"
          placeholderTextColor="#666"
          value={recipientEmail}
          onChangeText={setRecipientEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Text style={styles.label}>Amount (RLUSD)</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor="#666"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <Text style={styles.label}>Note (Optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="Add a note"
          placeholderTextColor="#666"
          value={note}
          onChangeText={setNote}
          multiline
        />

        <TouchableOpacity
          style={[styles.sendButton, loading && styles.disabledButton]}
          onPress={handleSendMoney}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Processing...' : 'Send RLUSD'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 30,
    textAlign: 'center',
  },
  formContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: 'white',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    color: 'white',
    fontSize: 16,
  },
  noteInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 30,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default SendMoney; 