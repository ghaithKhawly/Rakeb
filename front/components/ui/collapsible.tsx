import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Kinetic, TransitTheme } from "@/constants/theme";
import { hapticSelection } from "@/utils/haptics";

type CollapsibleProps = PropsWithChildren & {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultOpen?: boolean;
  isRTL?: boolean;
};

export function Collapsible({
  children,
  title,
  subtitle,
  icon = "options-outline",
  defaultOpen = false,
  isRTL = false,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.heading, isRTL && styles.headingRtl]}
        onPress={() => {
          hapticSelection();
          setIsOpen((value) => !value);
        }}
        activeOpacity={0.82}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={Kinetic.primary} />
        </View>

        <View style={[styles.copy, isRTL && styles.copyRtl]}>
          <ThemedText style={[styles.title, isRTL && styles.textRtl]}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText style={[styles.subtitle, isRTL && styles.textRtl]}>{subtitle}</ThemedText>
          ) : null}
        </View>

        <Ionicons
          name={isOpen ? "chevron-up" : isRTL ? "chevron-back" : "chevron-forward"}
          size={18}
          color={Kinetic.onSurfaceVariant}
        />
      </TouchableOpacity>
      {isOpen ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TransitTheme.panel.border,
    backgroundColor: TransitTheme.panel.cardBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 54,
  },
  headingRtl: {
    flexDirection: 'row-reverse',
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TransitTheme.panel.cardBgActive,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  copyRtl: {
    alignItems: 'flex-end',
  },
  title: {
    color: Kinetic.onSurface,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: Kinetic.onSurfaceVariant,
    fontSize: 12,
  },
  textRtl: {
    textAlign: 'right',
  },
  content: {
    marginTop: 10,
    gap: 10,
  },
});
