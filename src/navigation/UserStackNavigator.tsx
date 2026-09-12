// OfflineLedger — User Stack Navigator
// Handles the navigation stack inside the Users tab
import React from 'react';
import { View, Text, Image } from 'react-native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { UserListScreen } from '../screens/UserListScreen';
import { AddEditUserScreen } from '../screens/AddEditUserScreen';
import { UserDetailScreen } from '../screens/UserDetailScreen';
import { darkColors } from '../theme/colors';
import { fontWeight } from '../theme/typography';

export type UserStackParamList = {
  UserList: undefined;
  UserDetail: { userId: string };
  AddEditUser: { userId?: string }; // undefined = create new
};

const Stack = createStackNavigator<UserStackParamList>();

function HeaderTitleWithLogo({ title }: { title: string }) {
  return (
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
      <Text style={{ color: darkColors.textPrimary, fontWeight: fontWeight.bold, fontSize: 18 }}>
        {title}
      </Text>
    </View>
  );
}

export function UserStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: darkColors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: darkColors.border,
        },
        headerTintColor: darkColors.textPrimary,
        headerTitleStyle: {
          fontWeight: fontWeight.bold,
          fontSize: 18,
          color: darkColors.textPrimary,
        },
        cardStyle: { backgroundColor: darkColors.background },
        cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        headerBackTitle: '',
      }}
    >
      <Stack.Screen
        name="UserList"
        component={UserListScreen}
        options={{
          headerTitle: () => <HeaderTitleWithLogo title="RB Co." />,
        }}
      />
      <Stack.Screen
        name="UserDetail"
        component={UserDetailScreen}
        options={{ title: '' }}
      />
      <Stack.Screen
        name="AddEditUser"
        component={AddEditUserScreen}
        options={{
          headerTitle: () => <HeaderTitleWithLogo title="RB Co." />,
        }}
      />
    </Stack.Navigator>
  );
}

