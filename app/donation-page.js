import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  Alert,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const DonationPage = () => {
  const { charityName, charityCause, charityImage, ein, profileUrl } = useLocalSearchParams();

  const handleDonate = async () => {
    try {
      await Linking.openURL(profileUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not open the donation page');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${charityName} on Every.org: ${profileUrl}`,
      });
    } catch (error) {
      Alert.alert('Error', 'Could not share the charity');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Image
          source={{ uri: charityImage }}
          style={styles.image}
        />
        <View style={styles.content}>
          <Text style={styles.title}>{charityName}</Text>
          <Text style={styles.cause}>{charityCause}</Text>
          
          {ein && (
            <View style={styles.infoRow}>
              <MaterialIcons name="info" size={20} color="#666" />
              <Text style={styles.infoText}>EIN: {ein}</Text>
            </View>
          )}

          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={styles.donateButton}
              onPress={handleDonate}
            >
              <MaterialIcons name="favorite" size={24} color="#fff" />
              <Text style={styles.donateButtonText}>Donate Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleShare}
            >
              <MaterialIcons name="share" size={24} color="#007bff" />
              <Text style={styles.shareButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>About Donations</Text>
            <Text style={styles.infoDescription}>
              Your donation will be processed securely through Every.org. You'll receive
              a tax receipt for your records. 100% of your donation goes directly to
              the charity.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  image: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  cause: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#666',
  },
  actionContainer: {
    flexDirection: 'row',
    marginBottom: 30,
  },
  donateButton: {
    flex: 2,
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  donateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  shareButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
  },
  shareButtonText: {
    color: '#007bff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  infoSection: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
});

export default DonationPage; 