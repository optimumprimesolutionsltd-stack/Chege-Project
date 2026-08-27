import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { BrandLogo } from '@/components/BrandLogo';

export default function LoginScreen() {
  const { login, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const [signingIn, setSigningIn] = React.useState(false);

  async function handleLogin() {
    setSigningIn(true);
    try {
      await login();
    } finally {
      setSigningIn(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#cf7217" />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#0a1a10', '#0f2217', '#163020']}
      style={[styles.container, { paddingTop: topPad + 20, paddingBottom: botPad + 24 }]}
    >
      {/* Brand mark */}
      <View style={styles.brandWrap}>
        <View style={styles.logoSurface}>
          <BrandLogo style={styles.wordmark} />
        </View>
        <Text style={styles.tagline}>Shared finances, together</Text>
      </View>

      {/* Feature list */}
      <View style={styles.features}>
        <FeatureRow icon="bar-chart-2" text="Track every shilling your group spends" />
        <FeatureRow icon="refresh-cw" text="Log expenses anywhere, anytime" />
        <FeatureRow icon="users" text="Everyone in your group stays in sync" />
      </View>

      {/* Sign in button */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.signInBtn,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleLogin}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="log-in" size={18} color="#fff" />
              <Text style={styles.signInText}>Sign in to continue</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.disclaimer}>
          Your account works on web and mobile
        </Text>
      </View>
    </LinearGradient>
  );
}

function FeatureRow({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Feather name={icon} size={16} color="#cf7217" />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f2217',
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  brandWrap: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoSurface: {
    width: 250,
    height: 92,
    borderRadius: 24,
    backgroundColor: '#f7faf6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  wordmark: {
    width: '100%',
    height: '100%',
  },
  tagline: {
    fontSize: 16,
    color: '#7aaa8a',
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  features: {
    gap: 16,
    paddingVertical: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(207,114,23,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    color: '#f7faf6',
    fontFamily: 'Inter_500Medium',
    flex: 1,
  },
  footer: {
    gap: 12,
    alignItems: 'center',
  },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2e6b44',
    borderRadius: 16,
    paddingVertical: 16,
    width: '100%',
  },
  signInText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },
  disclaimer: {
    fontSize: 13,
    color: '#5c8a6c',
    fontFamily: 'Inter_400Regular',
  },
});
