import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Platform, Text, Modal } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/AuthContext';

export function DashboardHeader() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  
  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? insets.top : insets.top + 10 }]}>
      <View style={styles.contentContainer}>
        <View style={styles.searchSection}>
            <Ionicons name="search" size={18} color={Colors.dark.icon} style={styles.searchIcon} />
            <TextInput 
            placeholder="Search routes..." 
            placeholderTextColor={Colors.dark.icon}
            style={styles.searchInput}
            />
        </View>

        <View style={styles.rightSection}>
            <TouchableOpacity style={styles.iconButton}>
                <Ionicons name="notifications-outline" size={24} color={Colors.dark.icon} />
                <View style={styles.notificationDot} />
            </TouchableOpacity>

            <View style={{ position: 'relative', zIndex: 100 }}>
                <TouchableOpacity 
                  style={styles.profileButton}
                  onPress={() => setDropdownVisible(true)}
                >
                    <View style={styles.avatar}>
                        <ThemedText style={styles.avatarText}>TF</ThemedText>
                    </View>
                </TouchableOpacity>

                <Modal
                  visible={dropdownVisible}
                  transparent={true}
                  animationType="fade"
                  onRequestClose={() => setDropdownVisible(false)}
                >
                  <TouchableOpacity 
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPressOut={() => setDropdownVisible(false)}
                  >
                    <View style={[styles.dropdownMenu, { top: Platform.OS === 'ios' ? insets.top + 55 : insets.top + 65 }]}>
                      <TouchableOpacity 
                        style={styles.dropdownItem}
                        onPress={() => {
                          setDropdownVisible(false);
                          signOut();
                        }}
                      >
                        <Ionicons name="log-out-outline" size={20} color={Colors.dark.icon} />
                        <Text style={styles.dropdownText}>Log out</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </Modal>
            </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    paddingBottom: 12,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  searchSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    maxWidth: 400,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconButton: {
    position: 'relative',
    padding: 4,
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
    borderWidth: 1,
    borderColor: Colors.dark.background,
  },
  profileButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.dark.background,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownMenu: {
    position: 'absolute',
    right: 20,
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    paddingVertical: 8,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    zIndex: 1000,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dropdownText: {
    color: Colors.dark.icon,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
