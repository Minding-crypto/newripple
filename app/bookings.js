import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUserAndBookings = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        router.replace('/auth');
        return;
      }

      // Get user profile from auth
      setUser(currentUser);

      // Get bookings with modified query
      const { data: bookingsData, error } = await supabase
        .from('locker_bookings')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bookings:', error);
        Alert.alert('Error', 'Failed to fetch bookings. Please try again.');
        return;
      }

      setBookings(bookingsData || []);
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAndBookings();
  }, []);

  const handlePayment = async (booking) => {
    // Here you would integrate with your payment provider
    // For this example, we'll just simulate a payment
    try {
      const { error } = await supabase
        .from('locker_bookings')
        .update({
          payment_status: 'paid',
        })
        .eq('id', booking.id);

      if (error) throw error;

      Alert.alert('Success', 'Payment processed successfully!');
      fetchUserAndBookings();
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#ff6b6b';
      case 'completed':
        return '#2196F3';
      default:
        return '#ffd700';
    }
  };

  const getStatusText = (status, paymentStatus) => {
    if (status === 'rejected') return 'REJECTED';
    if (status === 'completed') return 'COMPLETED';
    if (status === 'approved' && paymentStatus !== 'paid') return 'PAY NOW';
    if (status === 'approved' && paymentStatus === 'paid') return 'PAID';
    return status.toUpperCase();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
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
      <View style={styles.profileHeader}>
        <View style={styles.profileImage}>
          <Text style={styles.profileInitial}>
            {user?.email?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.email}>{user?.email}</Text>
          <Text style={styles.joinDate}>Joined {formatDate(user?.created_at)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>My Bookings</Text>
      
      {bookings.length === 0 ? (
        <Text style={styles.noBookings}>No bookings found</Text>
      ) : (
        bookings.map((booking) => (
          <TouchableOpacity
            key={booking.id}
            style={styles.bookingCard}
            onPress={() => router.push({
              pathname: '/order-details',
              params: { orderId: booking.id }
            })}
          >
            <View style={styles.header}>
              <Text style={styles.bookingId}>Booking ID: {booking.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                <Text style={styles.statusText}>
                  {getStatusText(booking.status, booking.payment_status)}
                </Text>
              </View>
            </View>

            <Text style={styles.detail}>Tracking ID: {booking.tracking_id}</Text>
            <Text style={styles.detail}>Item: {booking.item_description}</Text>
            <Text style={styles.detail}>Quantity: {booking.quantity}</Text>
            <Text style={styles.detail}>Created: {formatDate(booking.created_at)}</Text>

            {booking.status === 'approved' && booking.payment_status !== 'paid' && (
              <TouchableOpacity
                style={styles.payButton}
                onPress={() => handlePayment(booking)}
              >
                <Text style={styles.payButtonText}>Pay ${booking.price}</Text>
              </TouchableOpacity>
            )}

            {booking.status === 'approved' && booking.payment_status === 'paid' && (
              <View style={styles.lockerInfo}>
                <Text style={styles.lockerTitle}>Locker Information</Text>
                <Text style={styles.detail}>Locker Number: {booking.locker_number}</Text>
                <Text style={styles.detail}>Password: {booking.locker_password}</Text>
                <Text style={styles.detail}>Unique ID: {booking.unique_id}</Text>
                <Text style={styles.detail}>Approved: {formatDate(booking.approved_at)}</Text>
                {booking.delivery_required ? (
                  <Text style={styles.detail}>Delivery Address: {booking.delivery_address}</Text>
                ) : (
                  <Text style={styles.warning}>
                    Please collect your order within 7 days of approval to avoid a fine of $10.00 per day.
                  </Text>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))
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
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    backgroundColor: '#1a1a1a',
    padding: 20,
    borderRadius: 15,
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  profileInitial: {
    fontSize: 36,
    color: 'white',
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  email: {
    fontSize: 20,
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  joinDate: {
    fontSize: 14,
    color: '#888',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
  },
  noBookings: {
    color: '#888',
    textAlign: 'center',
    fontSize: 16,
  },
  bookingCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  header: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 10,
    rowGap: 10,
  },
  bookingId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  detail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 5,
  },
  lockerInfo: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  lockerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  warning: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 10,
  },
  payButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    marginTop: 15,
  },
  payButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default Profile; 