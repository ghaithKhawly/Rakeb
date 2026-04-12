import React, { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type Region = MapCoordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type FitToCoordinatesOptions = {
  edgePadding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  animated?: boolean;
};

type MapViewHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (
    coordinates: MapCoordinate[],
    options?: FitToCoordinatesOptions,
  ) => void;
};

type MapViewProps = ViewProps & {
  initialRegion?: Region;
  mapType?: string;
  mapPadding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  showsUserLocation?: boolean;
  onPress?: (event: unknown) => void;
};

const MapView = forwardRef<MapViewHandle, MapViewProps>(function WebMapView(
  { style, children, ...rest },
  ref,
) {
  useImperativeHandle(ref, () => ({
    animateToRegion: () => {},
    fitToCoordinates: () => {},
  }));

  return (
    <View {...rest} style={[styles.mapFallback, style]}>
      {children}
    </View>
  );
});

type MarkerProps = {
  children?: React.ReactNode;
};

function Marker(_props: MarkerProps) {
  return null;
}

type PolylineProps = {
  children?: React.ReactNode;
};

function Polyline(_props: PolylineProps) {
  return null;
}

const styles = StyleSheet.create({
  mapFallback: {
    backgroundColor: "#0E1A2B",
  },
});

export { Marker, Polyline };
export default MapView;
