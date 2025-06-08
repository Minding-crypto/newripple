import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const WriteReview = () => {
  const params = useLocalSearchParams();
  const { userId, loanId } = params;

  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const handleSubmitReview = async () => {
    if (rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting');
      return;
    }

    if (comment.trim().length < 10) {
      Alert.alert('Comment Too Short', 'Please provide a more detailed comment (at least 10 characters)');
      return;
    }

    setLoading(true);
    try {
      // Replace 'current-user-id' with actual user ID from your auth system
      const currentUserId = 'current-user-id';

      if (currentUserId === userId) {
        Alert.alert('Error', 'You cannot review yourself');
        return;
      }

      // Check if user has already reviewed this person for this loan
      const { data: existingReview, error: checkError } = await supabase
        .from('user_reviews')
        .select('id')
        .eq('reviewer_id', currentUserId)
        .eq('reviewed_id', userId)
        .eq('loan_id', loanId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw checkError;
      }

      if (existingReview) {
        Alert.alert('Already Reviewed', 'You have already reviewed this user for this loan');
        return;
      }

      // Submit the review
      const { error: insertError } = await supabase
        .from('user_reviews')
        .insert([
          {
            reviewer_id: currentUserId,
            reviewed_id: userId,
            loan_id: loanId,
            rating: rating,
            comment: comment.trim(),
          },
        ]);

      if (insertError) throw insertError;

      // Update the user's credibility score
      const { error: updateError } = await supabase.rpc('update_user_credibility', {
        user_uuid: userId
      });

      if (updateError) {
        console.warn('Failed to update credibility score:', updateError);
        // Don't throw error as review was still successful
      }

      Alert.alert(
        'Review Submitted',
        'Thank you for your feedback! Your review will help other community members make informed decisions.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );

    } catch (error) {
      console.error('Error submitting review:', error);
      Alert.alert('Error', 'Failed to submit review. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          style={styles.starButton}
          onPress={() => setRating(i)}
        >
          <MaterialIcons
            name={i <= rating ? 'star' : 'star-border'}
            size={32}
            color={i <= rating ? '#ffc107' : '#ccc'}
          />
        </TouchableOpacity>
      );
    }
    return stars;
  };

  const getRatingLabel = (rating) => {
    switch (rating) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Very Good';
      case 5: return 'Excellent';
      default: return 'Select a rating';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Write Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialIcons name="info" size={24} color="#007bff" />
            <Text style={styles.infoTitle}>Community Review</Text>
          </View>
          <Text style={styles.infoText}>
            Your review helps other community members assess the credibility and trustworthiness of borrowers and funders. 
            Please be honest and constructive in your feedback.
          </Text>
        </View>

        {/* Rating Section */}
        <View style={styles.ratingCard}>
          <Text style={styles.sectionTitle}>Rating</Text>
          <Text style={styles.sectionSubtitle}>
            How would you rate your experience with this user?
          </Text>
          
          <View style={styles.starsContainer}>
            {renderStars()}
          </View>
          
          <Text style={styles.ratingLabel}>
            {getRatingLabel(rating)}
          </Text>
        </View>

        {/* Comment Section */}
        <View style={styles.commentCard}>
          <Text style={styles.sectionTitle}>Comment</Text>
          <Text style={styles.sectionSubtitle}>
            Share your experience and provide helpful feedback for the community
          </Text>
          
          <TextInput
            style={styles.commentInput}
            placeholder="Describe your experience with this user. Was communication good? Did they follow through on commitments? Any other relevant details..."
            value={comment}
            onChangeText={setComment}
            multiline
            numberOfLines={6}
            maxLength={500}
            textAlignVertical="top"
          />
          
          <Text style={styles.characterCount}>
            {comment.length}/500 characters
          </Text>
        </View>

        {/* Guidelines */}
        <View style={styles.guidelinesCard}>
          <Text style={styles.guidelinesTitle}>Review Guidelines</Text>
          <View style={styles.guidelineItem}>
            <MaterialIcons name="check-circle" size={16} color="#28a745" />
            <Text style={styles.guidelineText}>Be honest and constructive</Text>
          </View>
          <View style={styles.guidelineItem}>
            <MaterialIcons name="check-circle" size={16} color="#28a745" />
            <Text style={styles.guidelineText}>Focus on the loan interaction experience</Text>
          </View>
          <View style={styles.guidelineItem}>
            <MaterialIcons name="check-circle" size={16} color="#28a745" />
            <Text style={styles.guidelineText}>Avoid personal attacks or offensive language</Text>
          </View>
          <View style={styles.guidelineItem}>
            <MaterialIcons name="check-circle" size={16} color="#28a745" />
            <Text style={styles.guidelineText}>Help other members make informed decisions</Text>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (rating === 0 || comment.trim().length < 10 || loading) && styles.disabledButton
          ]}
          onPress={handleSubmitReview}
          disabled={rating === 0 || comment.trim().length < 10 || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="rate-review" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Review</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContainer: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  ratingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  starButton: {
    padding: 4,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  commentCard: {
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
  commentInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  guidelinesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  guidelinesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  guidelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  guidelineText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default WriteReview; 