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

const categories = [
  {
    id: '1',
    name: 'Animals & Pets',
    icon: 'pets',
    searchTerm: 'pets',
  },
  {
    id: '2',
    name: 'Education',
    icon: 'school',
    searchTerm: 'education',
  },
  {
    id: '3',
    name: 'Environment',
    icon: 'nature',
    searchTerm: 'environment',
  },
  {
    id: '4',
    name: 'Health',
    icon: 'healing',
    searchTerm: 'health',
  },
  {
    id: '5',
    name: 'Humanitarian',
    icon: 'people',
    searchTerm: 'humanitarian',
  },
  {
    id: '6',
    name: 'Arts & Culture',
    icon: 'palette',
    searchTerm: 'arts',
  },
];

const CategoryCard = ({ category }) => {
  const handlePress = () => {
    router.push({
      pathname: '/charity-list',
      params: {
        categoryName: category.name,
        searchTerm: category.searchTerm,
      },
    });
  };

  return (
    <TouchableOpacity style={styles.categoryCard} onPress={handlePress}>
      <MaterialIcons name={category.icon} size={40} color="#007bff" />
      <Text style={styles.categoryName}>{category.name}</Text>
    </TouchableOpacity>
  );
};

const CharityCategories = () => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Choose a Cause</Text>
        <Text style={styles.headerSubtitle}>
          Select a category to explore charities
        </Text>
      </View>
      <FlatList
        data={categories}
        renderItem={({ item }) => <CategoryCard category={item} />}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.gridContainer}
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
  gridContainer: {
    padding: 12,
  },
  categoryCard: {
    flex: 1,
    margin: 8,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 140,
  },
  categoryName: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
});

export default CharityCategories; 