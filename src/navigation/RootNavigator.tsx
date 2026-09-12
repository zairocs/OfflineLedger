// OfflineLedger — Root Navigator with Sliding Pill Tab Animation
import React, { useEffect, useRef } from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Text, View, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserStackNavigator } from './UserStackNavigator';
import { SettingsScreen } from '../screens/SettingsScreen';
import { LockScreen } from '../screens/LockScreen';
import { useAuthStore } from '../store/useAuthStore';
import { darkColors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { fontWeight } from '../theme/typography';

// ── Pure Vector Icons ────────────────────────────────────────────────────────

function ClientsVectorIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconBox}>
      <View style={styles.clientsGroup}>
        {/* Primary Person */}
        <View style={styles.personCol}>
          <View style={[styles.headCircle, { backgroundColor: color }]} />
          <View style={[styles.bodyArc, { backgroundColor: color }]} />
        </View>
        {/* Secondary Person */}
        <View style={[styles.personCol, styles.personSecondary]}>
          <View style={[styles.headCircleSmall, { backgroundColor: color, opacity: focused ? 1 : 0.75 }]} />
          <View style={[styles.bodyArcSmall, { backgroundColor: color, opacity: focused ? 1 : 0.75 }]} />
        </View>
      </View>
    </View>
  );
}

function SettingsVectorIcon({ focused, color }: { focused: boolean; color: string }) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.gearRing, { borderColor: color }]}>
        <View style={[styles.gearCenterDot, { backgroundColor: color }]} />
        <View style={[styles.gearNotchV, { backgroundColor: color }]} />
        <View style={[styles.gearNotchH, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

export type RootTabParamList = {
  Workers: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Custom Compact Floating Tab Bar Component with Sliding Active Pill
function CustomFloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const floatingBottom = Math.max(insets.bottom, 12) + 6;

  // Animated value for sliding position between tabs (0 -> 1)
  const slideAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: state.index,
      useNativeDriver: true,
      friction: 8,
      tension: 90,
    }).start();
  }, [state.index, slideAnim]);

  // Interpolate sliding pill position horizontally across tabs
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 120],
  });

  return (
    <View style={[styles.floatingWrapper, { bottom: floatingBottom }]}>
      <View style={styles.floatingPill}>
        {/* Single Sliding Active Pill Indicator */}
        <Animated.View
          style={[
            styles.slidingIndicator,
            {
              transform: [{ translateX }],
            },
          ]}
        />

        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const activeColor = isFocused ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)';

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.75}
              style={styles.floatingTabItem}
            >
              <View style={styles.tabItemContent}>
                {route.name === 'Workers' ? (
                  <ClientsVectorIcon focused={isFocused} color={activeColor} />
                ) : (
                  <SettingsVectorIcon focused={isFocused} color={activeColor} />
                )}
                <Text
                  style={[
                    styles.tabLabel,
                    { color: activeColor },
                  ]}
                >
                  {route.name === 'Workers' ? 'Clients' : 'Settings'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function RootNavigator() {
  const { isLocked, isPinSet } = useAuthStore();

  // Auth guard: render lock screen if locked or PIN not yet set
  if (isLocked || !isPinSet) {
    return <LockScreen />;
  }

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomFloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Workers"
        component={UserStackNavigator}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: true,
          headerStyle: {
            backgroundColor: darkColors.surface,
            borderBottomWidth: 1,
            borderBottomColor: darkColors.border,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: '#101010',
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={require('../assets/logo.png')}
                  style={{ width: 30, height: 30, borderRadius: 15 }}
                  resizeMode="cover"
                />
              </View>
              <Text style={{ color: darkColors.textPrimary, fontWeight: '700', fontSize: 18 }}>
                RB Co.
              </Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  floatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 240,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(20, 20, 24, 0.90)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 4,
    elevation: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    position: 'relative',
  },
  slidingIndicator: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    width: 112,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  floatingTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    zIndex: 1,
  },
  tabItemContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
  },

  // Icon geometry
  iconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Clients Vector Icon
  clientsGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  personCol: {
    alignItems: 'center',
  },
  headCircle: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginBottom: 2,
  },
  bodyArc: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  personSecondary: {
    marginLeft: -3,
  },
  headCircleSmall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginBottom: 2,
  },
  bodyArcSmall: {
    width: 10,
    height: 5,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },

  // Settings Vector Icon
  gearRing: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gearCenterDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  gearNotchV: {
    position: 'absolute',
    width: 2.5,
    height: 20,
    borderRadius: 1.25,
    top: -3,
    zIndex: -1,
  },
  gearNotchH: {
    position: 'absolute',
    width: 20,
    height: 2.5,
    borderRadius: 1.25,
    left: -3,
    zIndex: -1,
  },
});
