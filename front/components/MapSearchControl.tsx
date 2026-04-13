import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useLanguage } from "@/hooks/LanguageContext";

type MapSearchControlProps = {
  topInset: number;
  isSearching: boolean;
  onSearch: (query: string) => Promise<void> | void;
};

export function MapSearchControl({
  topInset,
  isSearching,
  onSearch,
}: MapSearchControlProps) {
  const { isRTL, t } = useLanguage();
  const searchInputRef = useRef<TextInput>(null);
  const searchAnim = useRef(new Animated.Value(0)).current;

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchWidth = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 260],
  });

  const toggleSearch = () => {
    const nextOpen = !isSearchOpen;
    setIsSearchOpen(nextOpen);

    Animated.timing(searchAnim, {
      toValue: nextOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      if (nextOpen) {
        searchInputRef.current?.focus();
      } else {
        Keyboard.dismiss();
      }
    });
  };

  const submitSearch = () => {
    const query = searchQuery.trim();
    if (!query) {
      return;
    }
    void onSearch(query);
  };

  return (
    <View
      style={[
        styles.searchOverlay,
        { top: topInset },
        isRTL ? styles.searchOverlayRtl : styles.searchOverlayLtr,
      ]}
    >
      <TouchableOpacity
        style={styles.searchIconButton}
        onPress={toggleSearch}
        activeOpacity={0.85}
      >
        <Ionicons
          name={isSearchOpen ? "close" : "search"}
          size={18}
          color={Colors.dark.text}
        />
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.searchBarWrap,
          {
            width: searchWidth,
            opacity: searchAnim,
          },
        ]}
      >
        <TextInput
          ref={searchInputRef}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t("search.placeholder")}
          placeholderTextColor={Colors.dark.icon}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
        <TouchableOpacity
          style={styles.searchGoButton}
          onPress={submitSearch}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <Ionicons
              name="arrow-forward"
              size={16}
              color={Colors.dark.primary}
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchOverlay: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
  },
  searchOverlayLtr: {
    left: 12,
  },
  searchOverlayRtl: {
    right: 12,
    flexDirection: "row-reverse",
  },
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: {
    marginLeft: 8,
    marginTop: 8,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchGoButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
