import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const insuranceCategories = [
  {
    id: '2',
    name: 'Agriculture Insurance',
    description: 'Coverage for crop and livestock protection',
    icon: 'agriculture',
    route: '/agriculture-insurance',
    color: '#28a745',
  },
  {
    id: '3',
    name: 'Parcel Insurance',
    description: 'Secure your shipments and deliveries',
    icon: 'local-shipping',
    route: '/parcel-insurance',
    color: '#ffc107',
  },
  {
    id: '4',
    name: 'Travel Insurance',
    description: 'Comprehensive travel protection',
    icon: 'card-travel',
    route: '/travel-insurance',
    color: '#17a2b8',
  },
  {
    id: '5',
    name: 'Health Insurance',
    description: 'Medical coverage and healthcare protection',
    icon: 'local-hospital',
    route: '/health-insurance',
    color: '#dc3545',
  },
  {
    id: '6',
    name: 'Property Insurance',
    description: 'Home and property protection',
    icon: 'home',
    route: '/property-insurance',
    color: '#6f42c1',
  },
];

const InsuranceCard = ({ insurance }) => {
  const handlePress = () => {
    router.push(insurance.route);
  };

  return (
    <TouchableOpacity style={styles.insuranceCard} onPress={handlePress}>
      <View style={[styles.iconContainer, { backgroundColor: insurance.color }]}>
        <MaterialIcons name={insurance.icon} size={40} color="#fff" />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.insuranceName}>{insurance.name}</Text>
        <Text style={styles.insuranceDescription}>{insurance.description}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#ccc" />
    </TouchableOpacity>
  );
};

const InsuranceCategories = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Insurance Options</Text>
        <Text style={styles.headerSubtitle}>
          Choose the protection you need
        </Text>
      </View>
      <FlatList
        data={insuranceCategories}
        renderItem={({ item }) => <InsuranceCard insurance={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
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
  listContainer: {
    padding: 16,
  },
  insuranceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  insuranceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  insuranceDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

export default InsuranceCategories; 