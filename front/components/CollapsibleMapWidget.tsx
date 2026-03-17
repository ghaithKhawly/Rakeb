import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Dimensions } from 'react-native';
import MapView, { UrlTile, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';

export function CollapsibleMapWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const mapRefSmall = useRef<MapView>(null);
  const mapRefLarge = useRef<MapView>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      
      const region = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      if (mapRefSmall.current) {
        mapRefSmall.current.animateToRegion(region);
      }
      if (mapRefLarge.current) {
        mapRefLarge.current.animateToRegion(region);
      }
    })();
  }, []);

  const handleRecenter = () => {
    if (location && mapRefLarge.current) {
      mapRefLarge.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  const defaultRegion: Region = {
    latitude: 33.5138,
    longitude: 36.2765,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const initialRegion = location ? {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : defaultRegion;

  return (
    <>
      {/* Inline Widget */}
      <View style={styles.widgetContainer}>
        <View style={styles.widgetHeader}>
          <ThemedText type="defaultSemiBold">Interactive Route Map</ThemedText>
          <TouchableOpacity onPress={() => setIsExpanded(true)} style={styles.expandButton}>
            <Ionicons name="expand" size={18} color={Colors.dark.icon} />
          </TouchableOpacity>
        </View>
        <View style={styles.smallMapContainer}>
          <MapView 
            ref={mapRefSmall}
            style={styles.smallMap} 
            initialRegion={initialRegion}
            showsUserLocation={true}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <UrlTile
              urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
              maximumZ={19}
            />
          </MapView>
          {/* Invisible overlay to capture taps and expand */}
          <TouchableOpacity 
            style={StyleSheet.absoluteFillObject} 
            onPress={() => setIsExpanded(true)} 
            activeOpacity={0.8}
          />
        </View>
      </View>

      {/* Full Screen Modal Map */}
      <Modal
        visible={isExpanded}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <View style={styles.fullScreenContainer}>
          <MapView 
            ref={mapRefLarge}
            style={styles.largeMap} 
            initialRegion={initialRegion}
            showsUserLocation={true}
          >
            <UrlTile
              urlTemplate="https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
              maximumZ={19}
            />
          </MapView>
          
          <TouchableOpacity 
            style={styles.closeButton} 
            onPress={() => setIsExpanded(false)}
          >
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.recenterButton} 
            onPress={handleRecenter}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  widgetContainer: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    height: 350,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  expandButton: {
    padding: 4,
  },
  smallMapContainer: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  smallMap: {
    ...StyleSheet.absoluteFillObject,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  largeMap: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recenterButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
