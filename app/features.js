import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const features = [
  {
    id: '1',
    name: 'Donate to Charities',
    description: 'Support various causes and make a difference',
    icon: 'favorite',
    route: '/charity-categories',
  },
  {
    id: '2',
    name: 'Buy Insurance',
    description: 'Protect yourself with various insurance options',
    icon: 'security',
    route: '/insurance-categories',
  },
  {
    id: '3',
    name: 'Microloans',
    description: 'Request community-funded loans up to 100 RLUSD',
    icon: 'account-balance',
    route: '/microloan-dashboard',
  },
  {
    id: '5',
    name: 'Loan Marketplace',
    description: 'Fund community loans and earn 5% returns',
    icon: 'trending-up',
    route: '/loan-marketplace',
  },
  {
    id: '6',
    name: 'Register a Charity',
    description: 'Add your organization to our platform',
    icon: 'add-circle',
    route: '/charity-upload-page',
  },
  {
    id: '7',
    name: 'Re',
    description: 'Add your organization to our platform',
    icon: 'add-circle',
    route: '/profile',
  },
];

const FeatureCard = ({ feature }) => {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(feature.route)}
    >
      <View style={styles.cardHeader}>
        <MaterialIcons name={feature.icon} size={32} color="#007bff" />
        <Text style={styles.cardTitle}>{feature.name}</Text>
      </View>
      <Text style={styles.cardDescription}>{feature.description}</Text>
    </TouchableOpacity>
  );
};

const Features = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Make a Difference</Text>
        <Text style={styles.headerSubtitle}>
          Choose how you want to contribute
        </Text>
      </View>
      <FlatList
        data={features}
        renderItem={({ item }) => <FeatureCard feature={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 12,
  },
  cardDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
});

export default Features; 