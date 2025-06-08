import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import mime from 'mime';
import { useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

// Function to decode base64
function decode(base64) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'image/jpeg' });
}

const terms = [
  "No Illegal or Prohibited Items",
  "Parcel Must Fit the Selected Locker Size",
  "Optional Forwarding to Singapore May Incur Additional Fees",
  "Payment is Non-Refundable After Successful Delivery",
  "Right to Inspect Suspicious Parcels",
  "Parcel Collection/Forwarding Must Be Done Within 7 Days",
  "Responsibility to Monitor Notifications",
  "Not Responsible for Courier or Customs Delays",
  "You Are Responsible for Ensuring Proper Packaging",
  "Fragile or Perishable Items Are Stored at Your Own Risk",
  "Accurate Shipping Information Must Be Provided",
  "No Cash or High-Value Items Without Insurance",
  "Lost or Unclaimed Items After Storage Limit May Be Disposed",
  "Use of Lockers Indicates Acceptance of All Terms and Policies"
];

const Booking = () => {
  const params = useLocalSearchParams();
  const { lockerId, lockerName, lockerPrice } = params;

  const [trackingId, setTrackingId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [itemDescriptions, setItemDescriptions] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [planType, setPlanType] = useState('basic');
  const [numberOfMonths, setNumberOfMonths] = useState('');

  useEffect(() => {
    const num = parseInt(quantity) || 0;
    // Update descriptions array length based on quantity
    setItemDescriptions(prev => {
      const newDescriptions = [...prev];
      while (newDescriptions.length < num) {
        newDescriptions.push('');
      }
      while (newDescriptions.length > num) {
        newDescriptions.pop();
      }
      return newDescriptions;
    });
    // Update images array length based on quantity
    setProductImages(prev => {
      const newImages = [...prev];
      while (newImages.length < num) {
        newImages.push(null);
      }
      while (newImages.length > num) {
        newImages.pop();
      }
      return newImages;
    });
  }, [quantity]);

  const pickImage = async (index) => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
    if (!permissionResult.granted) {
      alert('Permission to access media library is required!');
      return;
    }
  
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const imageUri = result.assets[0].uri;
      setProductImages((prev) => {
        const newImages = [...prev];
        newImages[index] = imageUri;
        return newImages;
      });
    }
  };

  const normalizeUri = (uri) => {
    if (Platform.OS === 'android') {
      return "file:///" + uri.split("file:/").join("");
    }
    return uri;
  };

  const updateItemDescription = (index, text) => {
    setItemDescriptions(prev => {
      const newDescriptions = [...prev];
      newDescriptions[index] = text;
      return newDescriptions;
    });
  };

  const validateForm = () => {
    if (!trackingId || !quantity || parseInt(quantity) < 1) {
      Alert.alert('Error', 'Please fill in tracking ID and quantity');
      return false;
    }

    // Check if all items have descriptions
    if (itemDescriptions.some(desc => !desc.trim())) {
      Alert.alert('Error', 'Please provide descriptions for all items');
      return false;
    }

   

    if (isDelivery && !deliveryAddress) {
      Alert.alert('Error', 'Please provide a delivery address');
      return false;
    }

    if (planType === 'monthly' && (!numberOfMonths || parseInt(numberOfMonths) < 1)) {
      Alert.alert('Error', 'Please enter a valid number of months');
      return false;
    }

    if (!termsAccepted) {
      Alert.alert('Error', 'Please accept the terms and conditions');
      return false;
    }

    return true;
  };

  const generateUniqueId = () => {
    // Generate a simple 6-character alphanumeric ID
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let uniqueId = '';
    for (let i = 0; i < 6; i++) {
      uniqueId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return uniqueId;
  };

  const calculateTotalPrice = () => {
    let basePrice = 0;
    if (planType === 'monthly') {
      basePrice = 40.00 * parseInt(numberOfMonths || 0); // Fixed $40 per month
    } else {
      // Basic plan uses the daily rate for 7 days
      basePrice = parseFloat(lockerPrice) * 7;
    }
    const deliveryFee = isDelivery ? 150 : 0;
    return basePrice + deliveryFee;
  };

  const handleBooking = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('User not authenticated');

      // Upload all images
      const imageUrls = [];
      for (let i = 0; i < productImages.length; i++) {
        const imageUri = productImages[i];
        if (!imageUri) {
          imageUrls.push(null);
          continue;
        }

        try {
          const normalizedUri = normalizeUri(imageUri);
          const fileName = normalizedUri.split("/").pop();
          const mimeType = mime.getType(normalizedUri) || 'image/jpeg';
          const filePath = `${user.id}/${Date.now()}_${fileName}`;

          // Create form data
          const formData = new FormData();
          formData.append('file', {
            uri: normalizedUri,
            type: mimeType,
            name: fileName
          });

          const { data, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(filePath, formData, {
              contentType: mimeType,
              upsert: false
            });

          if (uploadError) {
            console.error('Upload error for image', i, ':', uploadError);
            throw new Error(`Failed to upload image ${i + 1}: ${uploadError.message}`);
          }

          // Get the public URL
          const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(filePath);

          imageUrls.push(publicUrl);
        } catch (imageError) {
          console.error('Error processing image', i, ':', imageError);
          Alert.alert(
            'Image Upload Error',
            `Failed to process image ${i + 1}. Please try again or skip this image.`
          );
          imageUrls.push(null);
        }
      }

      const uniqueId = generateUniqueId();

      const { data, error } = await supabase
        .from('locker_bookings')
        .insert([
          {
            user_id: user.id,
            locker_type: lockerId,
            tracking_id: trackingId,
            unique_id: uniqueId,
            item_descriptions: itemDescriptions,
            quantity: parseInt(quantity),
            status: 'pending',
            price: calculateTotalPrice(),
            product_images: imageUrls.filter(url => url !== null),
            delivery_required: isDelivery,
            delivery_address: isDelivery ? deliveryAddress : null,
            payment_status: 'pending',
            plan_type: planType,
            number_of_months: planType === 'monthly' ? parseInt(numberOfMonths) : null,
          }
        ])
        .select();

      if (error) {
        console.error('Database error:', error);
        throw new Error('Failed to create booking: ' + error.message);
      }

      Alert.alert(
        'Success',
        'Your booking request has been submitted. Please wait for admin approval and then proceed with payment.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/bookings'),
          }
        ]
      );
    } catch (error) {
      console.error('Error in handleBooking:', error);
      Alert.alert('Error', 'Failed to create booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Book a {lockerName} Locker</Text>
      
     

      <View style={styles.form}>
        <View style={styles.planSelection}>
          <Text style={styles.label}>Select Plan Type</Text>
          <View style={styles.planOptions}>
            <TouchableOpacity 
              style={[styles.planOption, planType === 'basic' && styles.selectedPlan]}
              onPress={() => setPlanType('basic')}
            >
              <Text style={[styles.planOptionText, planType === 'basic' && styles.selectedPlanText]}>
                <Text style={{fontWeight: 'bold', fontSize: 17}}>Basic Plan</Text>{'\n'}(Item will be stored for 7 days after delivery to our lockers)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.planOption, planType === 'monthly' && styles.selectedPlan]}
              onPress={() => setPlanType('monthly')}
            >
              <Text style={[styles.planOptionText, planType === 'monthly' && styles.selectedPlanText]}>
              <Text style={{fontWeight: 'bold', fontSize: 17}}>Monthly Plan</Text>{'\n'}(Locker will be reserved for the specified number of months)
              </Text>
            </TouchableOpacity>
          </View>

          {planType === 'monthly' && (
            <View style={styles.monthsInput}>
              <Text style={styles.label}>Number of Months to Reserve Locker</Text>
              <TextInput
                style={styles.input}
                value={numberOfMonths}
                onChangeText={setNumberOfMonths}
                placeholder="Enter number of months"
                placeholderTextColor="#666"
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        <View style={{  flexDirection: 'row',
  alignItems: 'center'}}>
  <Text style={styles.label}>Tracking ID</Text>
  <TouchableOpacity 
    style={styles.helpIcon}
    onPress={() => Alert.alert(
      "Tracking ID Help",
      "Please enter the tracking ID provided by your seller/courier. You can find this in:\n\n• Your purchase confirmation email\n• The seller's website under 'My Orders'\n• Your courier's tracking page\n\nThis is usually a number or alphanumeric code that helps track your package."
    )}
  >
    <Ionicons name="help-circle" size={24} color="#4CAF50" />
  </TouchableOpacity>
</View>

        <View style={styles.inputWithHelp}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={trackingId}
            onChangeText={setTrackingId}
            placeholder="Enter tracking ID"
            placeholderTextColor="#666"
          />
        
        </View>

        <Text style={styles.label}>Quantity of Items in your order</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={setQuantity}
          placeholder="Enter quantity"
          placeholderTextColor="#666"
          keyboardType="numeric"
        />

        {Array.from({ length: parseInt(quantity) || 0 }).map((_, index) => (
          <View key={index} style={styles.itemContainer}>
            <Text style={styles.itemTitle}>Item {index + 1}</Text>
            
            <Text style={styles.label}>Upload Image of Item {index + 1}</Text>
            <TouchableOpacity 
              style={styles.imageButton} 
              onPress={() => pickImage(index)}
            >
              <Text style={styles.buttonText}>
                {productImages[index] ? 'Change Image' : 'Select Image'}
              </Text>
            </TouchableOpacity>
            {productImages[index] && (
              <Image 
                source={{ uri: productImages[index] }} 
                style={styles.preview} 
              />
            )}

            <Text style={styles.label}>Description of Item {index + 1}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={itemDescriptions[index]}
              onChangeText={(text) => updateItemDescription(index, text)}
              placeholder="Enter item description (e.g., estimated height, width, special handling requirements)"
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
            />
          </View>
        ))}

        <View style={styles.deliveryOption}>
          <Text style={styles.label}>Select Delivery Option</Text>
          <View style={styles.planOptions}>
            <TouchableOpacity 
              style={[styles.planOption, !isDelivery && styles.selectedPlan]}
              onPress={() => setIsDelivery(false)}
            >
              <Text style={[styles.planOptionText, !isDelivery && styles.selectedPlanText]}>
                <Text style={{ fontWeight: 'bold', fontSize: 17 }}>Self Collection</Text>{'\n'}
                (Pick up from our locker within 7 days of delivery to our lockers)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.planOption, isDelivery && styles.selectedPlan]}
              onPress={() => setIsDelivery(true)}
            >
              <Text style={[styles.planOptionText, isDelivery && styles.selectedPlanText]}>
                <Text style={{ fontWeight: 'bold', fontSize: 17 }}>Doorstep Delivery</Text>{'\n'}
                (+$150 – Delivered to your address)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {!isDelivery && (
          <View style={styles.deliveryAddress}>
            <View style={styles.locationInfo}>
        <Text style={styles.locationTitle}>Self Collection Location:</Text>
        <Text style={styles.locationText}>33-02, Jalan Austin Perdana 3/8,</Text>
        <Text style={styles.locationText}>Taman Mount Austin 81100 JB</Text>
        <Text style={styles.locationText}>Opening Hours: 9:00 AM - 10:00 PM Daily</Text>
      </View>
          </View>
        )}

        {isDelivery && (
          <View style={styles.deliveryAddress}>
            <Text style={styles.label}>Delivery Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={deliveryAddress}
              onChangeText={setDeliveryAddress}
              placeholder="Enter a valid Singapore delivery address"
              placeholderTextColor="#666"
              multiline
              numberOfLines={3}
            />
          </View>
        )}

        <Text style={styles.priceInfo}>
          {planType === 'basic' ? (
            `Base Price: ${parseFloat(lockerPrice).toFixed(2)}/day\n7-day Total: $${(parseFloat(lockerPrice) * 7).toFixed(2)}`
          ) : (
            `Monthly Rate: $40.00/month\n${numberOfMonths ? `${numberOfMonths} Month(s) Total: $${(40 * parseInt(numberOfMonths)).toFixed(2)}` : ''}`
          )}
          {isDelivery && '\nDelivery Fee: $150.00'}
          {'\nTotal: $' + calculateTotalPrice().toFixed(2)}
        </Text>

        <View style={styles.termsContainer}>
          <Text style={styles.termsTitle}>Terms and Conditions</Text>
          {terms.map((term, index) => (
            <Text key={index} style={styles.term}>• {term}</Text>
          ))}
          <View style={styles.acceptTerms}>
            <Switch
              value={termsAccepted}
              onValueChange={setTermsAccepted}
              trackColor={{ false: '#666', true: '#4CAF50' }}
            />
            <Text style={styles.acceptTermsText}>
              I accept all terms and conditions
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, (loading || !termsAccepted) && styles.disabledButton]}
          onPress={handleBooking}
          disabled={loading || !termsAccepted}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Submitting...' : 'Submit Booking'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    padding: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 20,
    textAlign: 'center',
  },
  locationInfo: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  locationText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 5,
  },
  form: {
    gap: 15,
  },
  label: {
    fontSize: 16,
    color: 'white',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
    color: 'white',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  imageButton: {
    backgroundColor: '#333',
    borderRadius: 10,
    textAlign: 'center',
    height: 50,
 justifyContent: 'center',
 alignItems: 'center',
 marginBottom: 10,
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 10,
  },
  deliveryOption: {
    marginVertical: 10,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
  },
  switchLabel: {
    color: 'white',
    fontSize: 16,
  },
  priceInfo: {
    fontSize: 18,
    color: '#4CAF50',
    marginTop: 10,
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
  },
  termsContainer: {
    marginTop: 20,
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
  },
  termsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  term: {
    color: '#888',
    marginBottom: 5,
    fontSize: 14,
  },
  acceptTerms: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  acceptTermsText: {
    color: 'white',
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 100
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
  planSelection: {
    marginBottom: 20,
  },
  planOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  planOption: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectedPlan: {
    borderColor: '#4CAF50',
    backgroundColor: '#1a1a1a',
  },
  planOptionText: {
    color: '#888',
    textAlign: 'center',
    fontSize: 14,
  },
  selectedPlanText: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  monthsInput: {
    marginTop: 15,
  },
  deliveryAddress: {
    marginVertical: 10,
  },
  itemContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 15,
    marginVertical: 10,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
  },
  inputWithHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  helpIcon: {
    padding: 5,
  },
});

export default Booking; 