import { router, useLocalSearchParams } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_HEIGHT = 280;
const IMAGE_HEIGHT = 180;

// Simple in-memory cache for API responses
const apiCache = new Map();

// Skeleton loading component
const SkeletonCard = memo(() => (
  <View style={styles.charityCard}>
    <View style={[styles.charityImage, styles.skeleton]} />
    <View style={styles.cardContent}>
      <View style={[styles.skeletonText, { width: '70%', height: 20, marginBottom: 8 }]} />
      <View style={[styles.skeletonText, { width: '90%', height: 16, marginBottom: 4 }]} />
      <View style={[styles.skeletonText, { width: '60%', height: 16, marginBottom: 12 }]} />
      <View style={[styles.skeletonText, { width: '40%', height: 14 }]} />
    </View>
  </View>
));

// Optimized image component with better error handling
const OptimizedImage = memo(({ uri, style }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const imageSource = useMemo(() => {
    if (imageError || !uri) {
      return { uri: `https://picsum.photos/${SCREEN_WIDTH - 32}/${IMAGE_HEIGHT}?grayscale&blur=1` };
    }
    return { uri };
  }, [uri, imageError]);

  return (
    <View style={style}>
      {!imageLoaded && !imageError && (
        <View style={[style, styles.skeleton]} />
      )}
      <Image
        source={imageSource}
        style={[style, { opacity: imageLoaded ? 1 : 0 }]}
        onLoad={() => setImageLoaded(true)}
        onError={() => {
          setImageError(true);
          setImageLoaded(true);
        }}
        resizeMode="cover"
        fadeDuration={200}
      />
    </View>
  );
});

// Highly optimized charity card with proper memoization
const CharityCard = memo(({ charity, onPress }) => {
  const handlePress = useCallback(() => onPress(charity), [charity, onPress]);

  return (
    <TouchableOpacity
      style={styles.charityCard}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <OptimizedImage
        uri={charity.coverImageUrl}
        style={styles.charityImage}
      />
      <View style={styles.cardContent}>
        <Text style={styles.charityName} numberOfLines={1}>
          {charity.name}
        </Text>
        <Text style={styles.charityDescription} numberOfLines={2}>
          {charity.description || 'Supporting communities and making a difference'}
        </Text>
        <Text style={styles.charityLocation} numberOfLines={1}>
          📍 {charity.location || 'Multiple locations'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.charity.ein === nextProps.charity.ein &&
    prevProps.charity.name === nextProps.charity.name &&
    prevProps.onPress === nextProps.onPress
  );
});

// Optimized footer component
const ListFooter = memo(({ loading }) => {
  if (!loading) return null;
  return (
    <View style={styles.footerLoader}>
      <ActivityIndicator size="small" color="#007bff" />
      <Text style={styles.loadingText}>Loading more...</Text>
    </View>
  );
});

// Empty state component
const EmptyState = memo(() => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyStateText}>No charities found</Text>
    <Text style={styles.emptyStateSubtext}>Try a different category</Text>
  </View>
));

const CharityList = () => {
  const { categoryName, searchTerm } = useLocalSearchParams();
  const [charities, setCharities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  // Use refs to track state and prevent memory leaks
  const mounted = useRef(true);
  const fetchTimeout = useRef(null);
  const lastFetchTime = useRef(0);
  const flatListRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mounted.current = false;
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
      }
    };
  }, []);

  // Generate cache key
  const getCacheKey = useCallback((term, pageNum) => `${term}-${pageNum}`, []);

  const fetchCharities = useCallback(async (loadMore = false) => {
    // Aggressive debouncing
    const now = Date.now();
    if (now - lastFetchTime.current < 300) {
      return;
    }
    lastFetchTime.current = now;

    const currentPage = loadMore ? page + 1 : 1;
    const cacheKey = getCacheKey(searchTerm, currentPage);

    if (!loadMore) {
      setLoading(true);
      setPage(1);
    } else {
      setLoadingMore(true);
    }

    try {
      // Check cache first
      if (apiCache.has(cacheKey)) {
        const cachedData = apiCache.get(cacheKey);
        if (mounted.current) {
          if (loadMore) {
            setCharities(prev => [...prev, ...cachedData]);
            setPage(prev => prev + 1);
          } else {
            setCharities(cachedData);
          }
          setHasMore(cachedData.length === 20);
        }
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(
        `https://partners.every.org/v0.2/search/${searchTerm}?apiKey=pk_live_f7d378d5df71cd8c6fd5b754996a8bc5&take=20&page=${currentPage}`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      
      if (!mounted.current) return;

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const newCharities = data.nonprofits || [];
      
      // Cache the results
      apiCache.set(cacheKey, newCharities);
      
      // Limit cache size to prevent memory issues
      if (apiCache.size > 50) {
        const firstKey = apiCache.keys().next().value;
        apiCache.delete(firstKey);
      }
      
      if (mounted.current) {
        if (loadMore) {
          setCharities(prev => [...prev, ...newCharities]);
          setPage(prev => prev + 1);
        } else {
          setCharities(newCharities);
        }
        setHasMore(newCharities.length === 20);
      }
    } catch (error) {
      if (mounted.current && error.name !== 'AbortError') {
        Alert.alert('Error', 'Failed to load charities. Please check your connection.');
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [searchTerm, page, getCacheKey]);

  useEffect(() => {
    // Reset everything when search term changes
    setCharities([]);
    setPage(1);
    setHasMore(true);
    
    // Clear existing timeout
    if (fetchTimeout.current) {
      clearTimeout(fetchTimeout.current);
    }
    
    // Immediate fetch for better UX
    fetchCharities();
  }, [searchTerm]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading && charities.length > 0) {
      fetchCharities(true);
    }
  }, [loadingMore, hasMore, loading, charities.length, fetchCharities]);

  const handleCharityPress = useCallback((charity) => {
    router.push({
      pathname: '/donation-page',
      params: {
        charityName: charity.name,
        charityCause: charity.description || 'Making a positive impact in communities',
        charityImage: charity.coverImageUrl || `https://picsum.photos/${SCREEN_WIDTH}/${IMAGE_HEIGHT}?grayscale`,
        ein: charity.ein,
        profileUrl: charity.profileUrl,
      },
    });
  }, []);

  const renderCharityCard = useCallback(({ item, index }) => (
    <CharityCard 
      charity={item} 
      onPress={handleCharityPress}
      key={`${item.ein}-${index}`}
    />
  ), [handleCharityPress]);

  const getItemLayout = useCallback((data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), []);

  const keyExtractor = useCallback((item, index) => 
    `${item.ein || item.slug || item.name || 'charity'}-${index}`, []
  );

  // Show skeleton loading for initial load
  const renderSkeletons = useMemo(() => {
    if (!loading) return null;
    return Array.from({ length: 6 }, (_, index) => (
      <SkeletonCard key={`skeleton-${index}`} />
    ));
  }, [loading]);

  if (loading && charities.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{categoryName}</Text>
          <Text style={styles.headerSubtitle}>Loading charities...</Text>
        </View>
        <View style={styles.listContainer}>
          {renderSkeletons}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{categoryName}</Text>
        <Text style={styles.headerSubtitle}>
          {charities.length}+ charities available
        </Text>
      </View>
      <FlatList
        ref={flatListRef}
        data={charities}
        renderItem={renderCharityCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={<ListFooter loading={loadingMore} />}
        ListEmptyComponent={!loading ? <EmptyState /> : null}
        // Aggressive performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={6}
        updateCellsBatchingPeriod={30}
        getItemLayout={getItemLayout}
        // Scrolling optimizations
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        // Pull to refresh
        onRefresh={() => {
          setCharities([]);
          setPage(1);
          fetchCharities();
        }}
        refreshing={loading}
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
    borderBottomColor: '#e9ecef',
    elevation: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6c757d',
  },
  listContainer: {
    padding: 16,
  },
  charityCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: Platform.OS === 'android' ? 6 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  charityImage: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: '#e9ecef',
  },
  cardContent: {
    padding: 16,
  },
  charityName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  charityDescription: {
    fontSize: 14,
    color: '#6c757d',
    lineHeight: 20,
    marginBottom: 8,
  },
  charityLocation: {
    fontSize: 12,
    color: '#868e96',
    fontWeight: '500',
  },
  footerLoader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6c757d',
  },
  skeleton: {
    backgroundColor: '#e9ecef',
  },
  skeletonText: {
    backgroundColor: '#e9ecef',
    borderRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6c757d',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 16,
    color: '#868e96',
  },
});

export default CharityList; 