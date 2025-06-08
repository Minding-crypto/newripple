import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import EmployerSection from '../components/EmployerSection';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import XummService from '../lib/xumm';

const Profile = () => {
  const { user, profile, loading, setProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [Loading, setLoading] = useState(null);
  const [wsUri, setWsUri] = useState(null);
  const [payloadUuid, setPayloadUuid] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [balances, setBalances] = useState({
    xrp: 0,
    rlusd: 0,
    loading: false,
  });
  const [session, setSession] = useState(null);

  // Using the test user ID for now
  const currentUserId = '550e8400-e29b-41d4-a716-446655440000';

  const fetchUserProfile = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUserId)
        .single();

      if (error) throw error;
      setUserProfile(data);

      // If user has XRP address, fetch balances
      if (data?.xrpl_address) {
        fetchBalances(data.xrpl_address);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  const fetchBalances = async (xrpAddress) => {
    try {
      setBalances(prev => ({ ...prev, loading: true }));

      // Get XRP balance using direct XRPL call (same as working getBalance function)
      const getXRPBalance = async () => {
        try {
          const res = await fetch('https://s.altnet.rippletest.net:51234', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              method: 'account_info',
              params: [
                {
                  account: xrpAddress,
                  ledger_index: 'validated',
                },
              ],
            }),
          });

          const json = await res.json();
          if (json.result?.account_data?.Balance) {
            const balanceDrops = json.result.account_data.Balance;
            return parseFloat(balanceDrops) / 1_000_000;
          }
          return 0;
        } catch (error) {
          console.error('Error fetching XRP balance:', error);
          return 0;
        }
      };

      // Get RLUSD balance using direct XRPL call
      const getRLUSDBalance = async () => {
        try {
          const res = await fetch('https://s.altnet.rippletest.net:51234', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              method: 'account_lines',
              params: [
                {
                  account: xrpAddress,
                  ledger_index: 'validated',
                },
              ],
            }),
          });

          const json = await res.json();
          if (json.result?.lines) {
            // Look for RLUSD trust line
            const rlusdLine = json.result.lines.find(
              line => line.currency === 'RLUSD' && line.account === 'rMxCkbh5KuWq3gF9W8K1HNu5cDLygjkT3Q'
            );
            return rlusdLine ? parseFloat(rlusdLine.balance) : 0;
          }
          return 0;
        } catch (error) {
          console.error('Error fetching RLUSD balance:', error);
          return 0;
        }
      };

      // Fetch both balances
      const [xrpBalance, rlusdBalance] = await Promise.all([
        getXRPBalance(),
        getRLUSDBalance(),
      ]);

      setBalances({
        xrp: xrpBalance,
        rlusd: rlusdBalance,
        loading: false,
      });

      console.log(`Updated balances - XRP: ${xrpBalance}, RLUSD: ${rlusdBalance}`);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setBalances(prev => ({ ...prev, loading: false }));
    }
  };

  const handleConnectWallet = async () => {
    // If a connection process is already active, don't create a new one.
    if (walletConnecting) {
      return;
    }

    try {
      setWalletConnecting(true); // Set loading state
      
      const result = await XummService.createSignInRequest();
      
      if (result.success) {
        setQrData(result.deeplink);
        setPayloadUuid(result.uuid);
        setShowQR(true); // Show modal

        // Start polling for result, which will now manage the loading state.
        pollForSignInResult(result.uuid);
      } else {
        Alert.alert('Error', result.error || 'Failed to create connection request.');
        setWalletConnecting(false); // Reset on failure
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      Alert.alert('Error', 'An unexpected error occurred while connecting the wallet.');
      setWalletConnecting(false); // Reset on failure
    }
  };

  const pollForSignInResult = async (uuid) => {
    const maxAttempts = 60; // Poll for 5 minutes (5-second intervals)
    let attempts = 0;

    const cleanup = () => {
      setShowQR(false);
      setWalletConnecting(false);
      setPayloadUuid(null);
      setQrData(null);
    };

    const poll = async () => {
      // Check if the process was cancelled by closing the modal
      if (!payloadUuid && attempts > 0) {
          console.log("Polling stopped: payloadUuid has been cleared.");
          return;
      }
      
      if (attempts >= maxAttempts) {
        cleanup();
        Alert.alert('Timeout', 'The wallet connection request timed out.');
        return;
      }

      try {
        const payloadStatus = await XummService.checkPayloadStatus(uuid);
        
        if (payloadStatus.success === false) {
          // This indicates a network or fetch error from our service. We should retry.
          console.warn('Polling check failed, retrying in 5s...', payloadStatus.error);
          attempts++;
          setTimeout(poll, 5000);
          return;
        }

        const { meta, response } = payloadStatus;

        if (meta.signed) {
          cleanup();
          await updateUserWalletAddress(response.account);
          Alert.alert('Success', 'Wallet connected successfully!');
          return;
        }

        if (meta.cancelled) {
          cleanup();
          Alert.alert('Cancelled', 'The wallet connection was cancelled.');
          return;
        }
        
        if (meta.expired) {
            cleanup();
            Alert.alert('Expired', 'The wallet connection request has expired.');
            return;
        }
        
        // If not resolved, continue polling
        console.log('Wallet connection pending... Polling again.');
        attempts++;
        setTimeout(poll, 5000);
        
      } catch (error) {
        console.error('Critical error during polling:', error);
        attempts++;
        setTimeout(poll, 5000);
      }
    };

    // Start polling after a short delay
    setTimeout(poll, 2000);
  };

  const updateUserWalletAddress = async (xrpAddress) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ xrpl_address: xrpAddress })
        .eq('id', currentUserId);

      if (error) throw error;

      // Refresh profile and fetch balances
      await fetchUserProfile();
    } catch (error) {
      console.error('Error updating wallet address:', error);
      Alert.alert('Error', 'Failed to save wallet address');
    }
  };

  const handleDisconnectWallet = () => {
    Alert.alert(
      'Disconnect Wallet',
      'Are you sure you want to disconnect your XRP wallet?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              // If there's a pending payload, cancel it first.
              if (payloadUuid) {
                await XummService.disconnect(payloadUuid);
                setPayloadUuid(null);
              }

              const { error } = await supabase
                .from('profiles')
                .update({ xrpl_address: null })
                .eq('id', currentUserId);

              if (error) throw error;

              setBalances({ xrp: 0, rlusd: 0, loading: false });
              await fetchUserProfile();
              Alert.alert('Success', 'Wallet disconnected');
            } catch (error) {
              console.error('Error disconnecting wallet:', error);
              Alert.alert('Error', 'Failed to disconnect wallet');
            }
          },
        },
      ]
    );
  };

  const handleModalClose = () => {
    setShowQR(false);
    setWalletConnecting(false); // Also reset the connecting state
    // If we have a payload ID, it means the user is closing the modal
    // without having signed the request. We should cancel it.
    if (payloadUuid) {
      console.log(`Modal closed with pending payload: ${payloadUuid}. Cancelling...`);
      XummService.disconnect(payloadUuid); // Use the new disconnect function
      setPayloadUuid(null); // Clear the payload ID
    }
  };

  const openInXumm = () => {
    if (qrData) {
      Linking.openURL(qrData).catch(err => {
        console.error('Error opening Xumm:', err);
        Alert.alert('Error', 'Could not open Xumm app. Please make sure it is installed.');
      });
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserProfile().finally(() => setRefreshing(false));
  }, [fetchUserProfile]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  
  return (
    <SafeAreaView style={styles.container}>
     

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* User Info Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {userProfile?.profile_picture_url ? (
                <Image
                  source={{ uri: userProfile.profile_picture_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <MaterialIcons name="person" size={48} color="#666" />
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {userProfile?.full_name || userProfile?.email || 'User'}
              </Text>
              <Text style={styles.profileEmail}>{userProfile?.email}</Text>
              {userProfile?.bio && (
                <Text style={styles.profileBio}>{userProfile.bio}</Text>
              )}
            </View>
          </View>

          {/* Credibility Score */}
          <View style={styles.credibilitySection}>
            <View style={styles.credibilityHeader}>
              <Text style={styles.credibilityTitle}>Credibility Score</Text>
              <View style={styles.credibilityBadge}>
                <MaterialIcons name="star" size={20} color="#ffc107" />
                <Text style={styles.credibilityScore}>
                  {userProfile?.credibility_score?.toFixed(1) || '0.0'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* XRP Wallet Section */}
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <MaterialIcons name="account-balance-wallet" size={24} color="#007bff" />
            <Text style={styles.walletTitle}>XRP Wallet</Text>
          </View>

          {userProfile?.xrpl_address ? (
            <View style={styles.connectedWallet}>
              <View style={styles.addressSection}>
                <Text style={styles.addressLabel}>Connected Address:</Text>
                <Text style={styles.addressText} numberOfLines={1}>
                  {userProfile.xrpl_address}
                </Text>
              </View>

              {/* Balances */}
              <View style={styles.balancesSection}>
                <Text style={styles.balancesTitle}>Balances</Text>
                <View style={styles.balanceRow}>
                  <View style={styles.balanceItem}>
                    <MaterialIcons name="currency-exchange" size={20} color="#ff9500" />
                    <Text style={styles.balanceLabel}>XRP</Text>
                    <Text style={styles.balanceAmount}>
                      {balances.loading ? '...' : balances.xrp.toFixed(6)}
                    </Text>
                  </View>
                  <View style={styles.balanceItem}>
                    <MaterialIcons name="attach-money" size={20} color="#28a745" />
                    <Text style={styles.balanceLabel}>RLUSD</Text>
                    <Text style={styles.balanceAmount}>
                      {balances.loading ? '...' : balances.rlusd.toFixed(2)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.refreshBalanceButton}
                  onPress={() => fetchBalances(userProfile.xrpl_address)}
                  disabled={balances.loading}
                >
                  <MaterialIcons name="refresh" size={16} color="#007bff" />
                  <Text style={styles.refreshBalanceText}>Refresh Balances</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleDisconnectWallet}
              >
                <MaterialIcons name="link-off" size={16} color="#dc3545" />
                <Text style={styles.disconnectButtonText}>Disconnect Wallet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noWallet}>
              <MaterialIcons name="account-balance-wallet" size={48} color="#ccc" />
              <Text style={styles.noWalletTitle}>No Wallet Connected</Text>
              <Text style={styles.noWalletText}>
                Connect your XRP wallet to fund loans and receive payments
              </Text>
              <TouchableOpacity
                style={styles.connectButton}
                onPress={handleConnectWallet}
                disabled={walletConnecting}
              >
                {walletConnecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="link" size={20} color="#fff" />
                    <Text style={styles.connectButtonText}>Connect XRP Wallet</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Quick Actions</Text>
          
          <View style={styles.actionsList}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push('/microloan-dashboard')}
            >
              <MaterialIcons name="account-balance" size={24} color="#007bff" />
              <Text style={styles.actionText}>My Loans</Text>
              <MaterialIcons name="arrow-forward-ios" size={16} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push('/loan-marketplace')}
            >
              <MaterialIcons name="trending-up" size={24} color="#28a745" />
              <Text style={styles.actionText}>Fund Loans</Text>
              <MaterialIcons name="arrow-forward-ios" size={16} color="#ccc" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => router.push('/features')}
            >
              <MaterialIcons name="dashboard" size={24} color="#ff9500" />
              <Text style={styles.actionText}>All Features</Text>
              <MaterialIcons name="arrow-forward-ios" size={16} color="#ccc" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Employer Section */}
        <EmployerSection />

      </ScrollView>

      {/* QR Code Modal */}
      <Modal
        visible={showQR}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleModalClose}
      >
        <View style={styles.modalContent}>
          <SafeAreaView style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Scan to Connect Wallet</Text>
            
            <View style={styles.qrContainer}>
              {qrData ? (
                <QRCode
                  value={qrData}
                  size={250}
                  color="black"
                  backgroundColor="white"
                />
              ) : (
                <ActivityIndicator size="large" color="#007bff" />
              )}
            </View>

            <Text style={styles.instructionsText}>
              Scan this QR code with your Xumm Wallet app to connect your account.
            </Text>

            <TouchableOpacity
              style={styles.xummButton}
              onPress={openInXumm}
              disabled={!qrData}
            >
              <MaterialIcons name="open-in-new" size={20} color="#fff" />
              <Text style={styles.xummButtonText}>Open in Xumm App</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={handleModalClose}
            >
              <Text style={styles.closeModalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  scrollContainer: {
    padding: 16,
  },
  profileCard: {
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
  profileHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  profileBio: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  credibilitySection: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 16,
  },
  credibilityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  credibilityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  credibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credibilityScore: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffc107',
    marginLeft: 4,
  },
  walletCard: {
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
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  connectedWallet: {
    gap: 16,
  },
  addressSection: {
    gap: 4,
  },
  addressLabel: {
    fontSize: 14,
    color: '#666',
  },
  addressText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
  },
  balancesSection: {
    gap: 12,
  },
  balancesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 16,
  },
  balanceItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  refreshBalanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 4,
  },
  refreshBalanceText: {
    fontSize: 14,
    color: '#007bff',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc3545',
    gap: 8,
  },
  disconnectButtonText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '500',
  },
  noWallet: {
    alignItems: 'center',
    gap: 16,
  },
  noWalletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  noWalletText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionsCard: {
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
  actionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  actionsList: {
    gap: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  qrContainer: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  instructionsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  xummButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  
  xummButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  closeModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc3545',
  },
  closeModalButtonText: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: '500',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

export default Profile; 