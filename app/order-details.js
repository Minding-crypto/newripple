
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const OrderDetails = () => {
  const params = useLocalSearchParams();
  const { orderId } = params;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOrderDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.replace('/auth');
        return;
      }

      // First verify this order belongs to the user
      const { data, error } = await supabase
        .from('locker_bookings')
        .select('*')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching order:', error);
        throw new Error('Order not found or access denied');
      }
      
      if (!data) {
        throw new Error('Order not found');
      }

      // Ensure item_descriptions and product_images are arrays
      const processedData = {
        ...data,
        item_descriptions: Array.isArray(data.item_descriptions) ? data.item_descriptions : [data.item_descriptions].filter(Boolean),
        product_images: Array.isArray(data.product_images) ? data.product_images : [data.product_images].filter(Boolean)
      };

      // Get user email from auth.users
      const { data: userData } = await supabase.auth.getUser();
      
      // Combine order data with user email
      setOrder({
        ...processedData,
        user_email: userData.user.email
      });

    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', error.message);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const handlePayment = async () => {
    try {
      const { error } = await supabase
        .from('locker_bookings')
        .update({
          payment_status: 'paid',
        })
        .eq('id', orderId);

      if (error) throw error;

      Alert.alert('Success', 'Payment processed successfully!');
      fetchOrderDetails();
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Error', error.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  if (loading || !order) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Order Details</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
          <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Order Information</Text>
        <Text style={styles.detail}>Order ID: {order.id}</Text>
        <Text style={styles.detail}>Created: {formatDate(order.created_at)}</Text>
        <Text style={styles.detail}>Status: {order.status}</Text>
        <Text style={styles.detail}>Payment Status: {order.payment_status || 'pending'}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Item Details</Text>
        <Text style={styles.detail}>Tracking ID: {order.tracking_id}</Text>
        <Text style={styles.detail}>Total Quantity: {order.quantity}</Text>
        <Text style={styles.detail}>Item Descriptions: {order.item_descriptions.join(', ')}</Text>
        {Array.isArray(order.product_images) && order.product_images.map((image, index) => (
  <View key={index} style={styles.itemDetail}>
    <Text style={styles.itemTitle}>Image {index + 1}</Text>
    
    <Image
      source={{ uri: image }}
      style={styles.productImage}
      resizeMode="contain"
    />
 
  </View>
))}

        
        {(!Array.isArray(order.item_descriptions) || order.item_descriptions.length === 0) && (
          <Text style={styles.detail}>No items to display</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Information</Text>
        {order.delivery_required ? (
          <>
            <Text style={styles.detail}>Delivery Method: Doorstep Delivery</Text>
            <Text style={styles.detail}>Delivery Address: {order.delivery_address}</Text>
            <Text style={styles.detail}>Delivery Fee: $150.00</Text>
          </>
        ) : (
          <>
            <Text style={styles.detail}>Delivery Method: Self Collection</Text>
            <Text style={styles.detail}>Collection Address:</Text>
            <Text style={styles.detail}>33-02, Jalan Austin Perdana 3/8,</Text>
            <Text style={styles.detail}>Taman Mount Austin 81100 JB</Text>
            <Text style={styles.detail}>Opening Hours: 9:00 AM - 10:00 PM Daily</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plan Details</Text>
        <Text style={styles.detail}>Plan Type: {order.plan_type === 'monthly' ? 'Monthly Plan' : 'Basic Plan (7 days)'}</Text>
        {order.plan_type === 'monthly' && (
          <Text style={styles.detail}>Duration: {order.number_of_months} month(s)</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment Details</Text>
        {order.plan_type === 'monthly' ? (
          <>
            <Text style={styles.detail}>Monthly Rate: $40.00</Text>
            <Text style={styles.detail}>Number of Months: {order.number_of_months}</Text>
            <Text style={styles.detail}>Plan Total: ${(40 * order.number_of_months).toFixed(2)}</Text>
          </>
        ) : (
          <Text style={styles.detail}>7-Day Storage: ${order.price.toFixed(2)}</Text>
        )}
        {order.delivery_required && <Text style={styles.detail}>Delivery Fee: $150.00</Text>}
        <Text style={styles.totalPrice}>
          Total: ${order.price.toFixed(2)}
        </Text>
      </View>

      {order.status === 'approved' && order.payment_status !== 'paid' && (
        <TouchableOpacity style={styles.payButton} onPress={handlePayment}>
          <Text style={styles.payButtonText}>
            Pay ${order.price.toFixed(2)}
          </Text>
        </TouchableOpacity>
      )}

      {order.status === 'approved' && order.payment_status === 'paid' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Locker Information</Text>
          <Text style={styles.detail}>Locker Number: {order.locker_number}</Text>
          <Text style={styles.detail}>Password: {order.locker_password}</Text>
          <Text style={styles.detail}>Unique ID: {order.unique_id || 'Not available'}</Text>
          {!order.delivery_required && order.plan_type === 'basic' && (
            <Text style={styles.warning}>
              Please collect your order within 7 days of approval to avoid a fine of $10.00 per day.
            </Text>
          )}
          {!order.delivery_required && order.plan_type === 'monthly' && (
            <Text style={styles.warning}>
              Please collect your order before your {order.number_of_months}-month plan expires to avoid a fine of $10.00 per day.
            </Text>
          )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
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
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  detail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 5,
  },
  link: {
    fontSize: 14,
    color: '#4CAF50',
    textDecorationLine: 'underline',
    marginTop: 5,
  },
  productImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginTop: 10,
  },
  totalPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 10,
  },
  payButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  payButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: 16,
  },
  warning: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 10,
  },
  itemDetail: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
});

export default OrderDetails; 