import React from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Colors } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { Ionicons } from '@expo/vector-icons';

export function RoutePlannerWidget() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flash-outline" size={18} color={Colors.dark.primary} />
        <ThemedText type="defaultSemiBold" style={styles.title}>Quick Route Planner</ThemedText>
      </View>

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color={Colors.dark.primary} style={styles.inputIcon} />
          <TextInput 
            placeholder="From: Central Station" 
            placeholderTextColor={Colors.dark.icon}
            style={styles.input}
          />
        </View>

        <View style={styles.swapContainer}>
            <View style={styles.swapLine} />
            <TouchableOpacity style={styles.swapButton}>
                <Ionicons name="arrow-down" size={14} color={Colors.dark.icon} />
            </TouchableOpacity>
            <View style={styles.swapLine} />
        </View>

        <View style={styles.inputWrapper}>
          <Ionicons name="location-outline" size={18} color="#EF4444" style={styles.inputIcon} />
          <TextInput 
            placeholder="To: University Campus" 
            placeholderTextColor={Colors.dark.icon}
            style={styles.input}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.button}>
        <ThemedText style={styles.buttonText}>Find Best Route</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputContainer: {
    gap: 0,
    marginBottom: 20,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  swapContainer: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  swapLine: {
    width: 1,
    height: '100%',
    backgroundColor: Colors.dark.border,
  },
  swapButton: {
    position: 'absolute',
    backgroundColor: Colors.dark.surface,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: Colors.dark.primary,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: Colors.dark.background,
    fontWeight: '700',
    fontSize: 15,
  },
});
