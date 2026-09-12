// OfflineLedger — AdvanceRow Component
// Clean list row for a single advance entry: date/time, description, amount, delete action.
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { AdvanceEntry } from '../db/models/AdvanceEntry';
import { darkColors } from '../theme/colors';
import { typography, fontWeight } from '../theme/typography';
import { spacing, radius } from '../theme/spacing';
import { formatDate, formatTime, formatCurrency } from '../utils/formatters';

interface AdvanceRowProps {
  entry: AdvanceEntry;
  onDelete: (entry: AdvanceEntry) => void;
}

export function AdvanceRow({ entry, onDelete }: AdvanceRowProps) {
  return (
    <View style={styles.row}>
      {/* Left: date + time column */}
      <View style={styles.dateCol}>
        <Text style={styles.date}>{formatDate(entry.createdAt)}</Text>
        <Text style={styles.time}>{formatTime(entry.createdAt)}</Text>
      </View>

      {/* Vertical divider */}
      <View style={styles.divider} />

      {/* Middle: description */}
      <View style={styles.descCol}>
        {entry.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {entry.description}
          </Text>
        ) : (
          <Text style={styles.noDescription}>Advance payment</Text>
        )}
      </View>

      {/* Right: amount + delete button */}
      <View style={styles.rightCol}>
        <View style={styles.amountCol}>
          <Text style={styles.currencyLabel}>PKR</Text>
          <Text style={styles.amount} numberOfLines={1}>
            {formatCurrency(entry.amount)}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onDelete(entry)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.card,
    marginHorizontal: spacing[4],
    marginVertical: spacing[1],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.cardBorder,
    gap: spacing[3],
  },

  // Date column
  dateCol: {
    width: 80,
    gap: 2,
    alignItems: 'flex-start',
  },
  date: {
    ...typography.labelSmall,
    color: darkColors.textSecondary,
    fontSize: 11,
  },
  time: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    fontSize: 10,
  },

  // Divider
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: darkColors.divider,
  },

  // Description column
  descCol: {
    flex: 1,
  },
  description: {
    ...typography.bodySmall,
    color: darkColors.textPrimary,
    lineHeight: 18,
  },
  noDescription: {
    ...typography.bodySmall,
    color: darkColors.textDisabled,
    fontStyle: 'italic',
  },

  // Right column
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  amountCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  currencyLabel: {
    ...typography.labelSmall,
    color: darkColors.textDisabled,
    fontSize: 9,
  },
  amount: {
    ...typography.mono,
    color: darkColors.advanceAmount,
    fontWeight: fontWeight.bold,
    fontSize: 15,
    maxWidth: 90,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: darkColors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 14,
    color: darkColors.error,
  },
});
