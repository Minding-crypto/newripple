import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const Admin = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [lockerPassword, setLockerPassword] = useState('');

  const fetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Check if user is admin (you should implement proper admin check)
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (adminError || !adminData) {
        Alert.alert('Error', 'Unauthorized access');
        router.replace('/');
        return;
      }

      const { data, error } = await supabase
        .from('locker_bookings')
        .select(`
          *,
          profiles:user_id (email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBookings(data);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleApprove = async (booking) => {
    setSelectedBooking(booking);
  };

  const confirmApproval = async () => {
    if (!lockerPassword) {
      Alert.alert('Error', 'Please enter a locker password');
      return;
    }

    try {
      const lockerNumber = Math.floor(Math.random() * 1000) + 1; // Generate random locker number
      const uniqueId = Math.random().toString(36).substring(2, 15);

      const { error } = await supabase
        .from('locker_bookings')
        .update({
          status: 'approved',
          locker_number: lockerNumber,
          locker_password: lockerPassword,
          unique_id: uniqueId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', selectedBooking.id);

      if (error) throw error;

      // Send notification to user (implement your notification system)
      Alert.alert('Success', 'Booking approved and notification sent to user');
      setSelectedBooking(null);
      setLockerPassword('');
      fetchBookings();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleReject = async (booking) => {
    try {
      const { error } = await supabase
        .from('locker_bookings')
        .update({
          status: 'rejected',
        })
        .eq('id', booking.id);

      if (error) throw error;

      Alert.alert('Success', 'Booking rejected');
      fetchBookings();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>
      {bookings.map((booking) => (
        <View key={booking.id} style={styles.bookingCard}>
          <Text style={styles.bookingId}>Booking ID: {booking.id}</Text>
          <Text style={styles.bookingDetail}>User: {booking.profiles.email}</Text>
          <Text style={styles.bookingDetail}>Tracking ID: {booking.tracking_id}</Text>
          <Text style={styles.bookingDetail}>Item: {booking.item_description}</Text>
          <Text style={styles.bookingDetail}>Quantity: {booking.quantity}</Text>
          <Text style={styles.bookingDetail}>Status: {booking.status}</Text>
          
          {booking.status === 'pending' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.button, styles.approveButton]}
                onPress={() => handleApprove(booking)}
              >
                <Text style={styles.buttonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={() => handleReject(booking)}
              >
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {selectedBooking && (
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Set Locker Password</Text>
          <TextInput
            style={styles.input}
            value={lockerPassword}
            onChangeText={setLockerPassword}
            placeholder="Enter locker password"
            placeholderTextColor="#666"
            secureTextEntry
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.button, styles.approveButton]}
              onPress={confirmApproval}
            >
              <Text style={styles.buttonText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={() => setSelectedBooking(null)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  bookingId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  bookingDetail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  button: {
    padding: 10,
    borderRadius: 5,
    width: '48%',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#ff6b6b',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 20,
    marginTop: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 10,
    color: 'white',
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default Admin; 