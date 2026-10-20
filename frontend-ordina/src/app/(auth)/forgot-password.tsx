import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth-field';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { requestPasswordReset, resetPassword } from '@/services/ai';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function sendCode() {
    if (!email.trim()) {
      Alert.alert('Reset password', 'Enter the email on your account.');
      return;
    }
    try {
      const data = await requestPasswordReset(email.trim());
      setIssued(true);
      setDevCode(data.emailed ? null : data.code || null);
      Alert.alert('Reset password', data.message);
    } catch (error: any) {
      Alert.alert('Reset password', error?.response?.data?.message || 'Unable to start a reset.');
    }
  }

  async function applyReset() {
    if (!code.trim() || password.length < 8) {
      Alert.alert('Reset password', 'Enter the 6-digit code and a new password with at least 8 characters.');
      return;
    }
    try {
      await resetPassword(email.trim(), code.trim(), password);
      Alert.alert('Password updated', 'Sign in with your new password.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Reset password', error?.response?.data?.message || 'Unable to reset that password.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ThemedText style={styles.title}>Forgot Password?</ThemedText>
        <ThemedText themeColor="textSecondary">
          We send a 6-digit code. If the API has no SMTP settings, the code is shown here instead of email.
        </ThemedText>
        <AuthField
          label="Email Address"
          placeholder="sarah.jones@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PrimaryButton label="Send reset code" onPress={() => void sendCode()} />
        {issued ? (
          <>
            {devCode ? (
              <ThemedText style={{ color: theme.primary }}>
                Email was not sent. Your code is {devCode}.
              </ThemedText>
            ) : null}
            <AuthField
              label="Reset code"
              placeholder="123456"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
            />
            <AuthField label="New password" placeholder="••••••••" isPassword value={password} onChangeText={setPassword} />
            <PrimaryButton label="Set new password" onPress={() => void applyReset()} />
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontFamily: 'Poppins_700Bold' },
});
