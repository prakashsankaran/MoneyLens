import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { Button, Loading } from '@/components/ui';
import { createQueryClient } from '@/lib/queries';
import { colors, type } from '@/lib/theme';

export default function RootLayout() {
  const [client] = useState(createQueryClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const { status, problem, retry } = useAuth();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <Loading label="Opening MoneyLens" />
      </View>
    );
  }
  if (status === 'unreachable') {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          gap: 16,
          backgroundColor: colors.canvas,
        }}
      >
        <Text accessibilityRole="header" style={type.title}>
          MoneyLens is offline
        </Text>
        <Text style={type.body}>{problem}</Text>
        <Button label="Try again" onPress={retry} />
      </View>
    );
  }
  const signedIn = status === 'authenticated';
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="transaction/[id]"
          options={{ headerShown: true, title: 'Transaction' }}
        />
        <Stack.Screen name="imports/index" options={{ headerShown: true, title: 'Imports' }} />
        <Stack.Screen name="imports/[id]" options={{ headerShown: true, title: 'Review import' }} />
        <Stack.Screen name="assistant" options={{ headerShown: true, title: 'MoneyLens AI' }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
      </Stack.Protected>
    </Stack>
  );
}
