import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Kinetic } from "@/constants/theme";
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/hooks/AuthContext";
import { useLanguage } from "@/hooks/LanguageContext";
import { SettingsActionCard } from "@/components/settings/SettingsActionCard";

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { language, isRTL, setLanguage, t } = useLanguage();

  return (
    <View style={[styles.safeArea, isRTL && styles.safeAreaRtl]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12) + 12,
            paddingBottom: Math.max(insets.bottom, 20) + 96,
          },
        ]}
      >
        <View style={styles.hero}>
          <ThemedText style={[styles.heroTitle, isRTL && styles.textRtl]}>
            {t("settings.title")}
          </ThemedText>
          <ThemedText style={styles.heroSubtitle}>
            {t("settings.subtitle")}
          </ThemedText>
        </View>

        <View style={[styles.profileCard, isRTL && styles.rowRtl]}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person" size={24} color={Kinetic.primary} />
          </View>
          <View>
            <ThemedText style={styles.profileName}>
              {user?.username ?? t("settings.userFallback")}
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={[styles.sectionLabel, isRTL && styles.textRtl]}>
            {t("settings.section.transportation")}
          </ThemedText>
          <SettingsActionCard
            icon="map"
            title={t("settings.routes.title")}
            subtitle={t("settings.routes.subtitle")}
            isRTL={isRTL}
            onPress={() => router.push("/(settings)/routes")}
          />
          <SettingsActionCard
            icon="options"
            title={t("settings.preferences.title")}
            subtitle={t("settings.preferences.subtitle")}
            isRTL={isRTL}
            onPress={() => router.push("/(settings)/preferences" as never)}
          />
          <SettingsActionCard
            icon="time"
            title={t("settings.history.title")}
            subtitle={t("settings.history.subtitle")}
            isRTL={isRTL}
            onPress={() => router.push("/(settings)/history" as never)}
          />

          <View style={styles.languageCard}>
            <View style={styles.languageHeader}>
              <ThemedText style={styles.cardTitle}>
                {t("settings.language.title")}
              </ThemedText>
              <ThemedText style={styles.cardSubtitle}>
                {t("settings.language.subtitle")}
              </ThemedText>
            </View>
            <View style={styles.languageToggleRow}>
              <TouchableOpacity
                style={[
                  styles.languageButton,
                  language === "en" && styles.languageButtonActive,
                ]}
                onPress={() => {
                  void setLanguage("en");
                }}
              >
                <ThemedText
                  style={[
                    styles.languageButtonText,
                    language === "en" && styles.languageButtonTextActive,
                  ]}
                >
                  {t("language.english")}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.languageButton,
                  language === "ar" && styles.languageButtonActive,
                ]}
                onPress={() => {
                  void setLanguage("ar");
                }}
              >
                <ThemedText
                  style={[
                    styles.languageButtonText,
                    language === "ar" && styles.languageButtonTextActive,
                  ]}
                >
                  {t("language.arabic")}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          activeOpacity={0.85}
          onPress={() => {
            void signOut();
          }}
        >
          <Ionicons name="log-out-outline" size={20} color="#BA1A1A" />
          <ThemedText style={styles.signOutText}>
            {t("settings.signout")}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Kinetic.surfaceLow,
  },
  safeAreaRtl: {
    direction: "rtl",
  },
  rowRtl: {
    flexDirection: "row-reverse",
  },
  textRtl: {
    textAlign: "right",
  },
  content: {
    paddingHorizontal: 24,
    gap: 18,
  },
  hero: {
    gap: 2,
    marginBottom: 8,
    paddingVertical: 2,
  },
  heroTitle: {
    color: Kinetic.onSurface,
    fontWeight: "900",
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -1,
  },
  heroSubtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 15,
    fontWeight: "500",
  },
  profileCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#dde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    color: Kinetic.onSurface,
    fontSize: 19,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: Kinetic.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Kinetic.onSurface,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Kinetic.onSurfaceVariant,
    marginTop: 2,
  },
  languageCard: {
    borderRadius: 22,
    backgroundColor: Kinetic.surfaceContainer,
    minHeight: 112,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  languageHeader: {
    gap: 2,
  },
  languageToggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  languageButton: {
    flex: 1,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Kinetic.outlineVariant,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  languageButtonActive: {
    borderColor: Kinetic.primary,
    backgroundColor: "#dfe6ff",
  },
  languageButtonText: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
    fontWeight: "700",
  },
  languageButtonTextActive: {
    color: Kinetic.primary,
  },
  signOutButton: {
    height: 58,
    borderRadius: 18,
    backgroundColor: "#ffeceb",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  signOutText: {
    color: "#BA1A1A",
    fontWeight: "800",
    fontSize: 16,
  },
});
