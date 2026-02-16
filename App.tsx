// App.tsx
import React, { useEffect, useState, useCallback } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createNativeStackNavigator,
  NativeStackNavigationOptions,
} from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";

import { BiometricProvider } from "./src/lib/biometricContext";
import {
  getBiometricEnabled,
  setBiometricEnabled as persistBiometricEnabled,
} from "./src/lib/biometricPrefs";
import { promptBiometricUnlock } from "./src/lib/biometric";
import DailyBriefingScreen from "./src/screens/DailyBriefingScreen";


import LockScreen from "./src/screens/LockScreen";

// ✅ tus screens
import HomeScreen from "./src/screens/HomeScreen";
import DetailsScreen from "./src/screens/DetailsScreen";
import PaymentDetailsScreen from "./src/screens/PaymentDetailsScreen";
import InstrumentSectionScreen from "./src/screens/InstrumentSectionScreen";
import ChargeScreen from "./src/screens/ChargeScreen"; // 👈 ESTE

import AddStep1Screen from "./src/screens/AddStep1Screen";
import AddInstrumentsScreen from "./src/screens/AddInstrumentsScreen";
import AddPaymentScreen from "./src/screens/AddPaymentScreen";

import AgendaScreen from "./src/screens/AgendaScreen";

import ConfigScreen from "./src/screens/ConfigScreen";
import ArchiveScreen from "./src/screens/ArchiveScreen";
import PendingsScreen from "./src/screens/PendingsScreen";

import LoginScreen from "./src/screens/LoginScreen";

/** -------------------------
 * TIPOS NAV
 * -------------------------- */

export type RootTabsParamList = {
  HomeTab: undefined;
  AddTab: undefined;
  ExtraTab: undefined;
  ConfigTab: undefined;
};


export type HomeStackParamList = {
  Home: undefined;
  DailyBriefing: { autoRunId?: number } | undefined;
  Details: { projectId: string };
  PaymentDetails: { projectId: string };
  Charge: { projectId: string };
  InstrumentSection: {
    projectId: string;
    section: "MUSICOS" | "EDICION" | "AFINACION";
  };
};






export type AddStackParamList = {
  AddStep1: undefined;
  AddInstruments: { draftId: string };
  AddPayment: { draftId: string };
};

export type ExtraStackParamList = {
  Agenda: undefined;
};

export type ConfigStackParamList = {
  Config: undefined;
  Archive: undefined;
  Pendings: undefined;
};

export type AuthStackParamList = {
  Auth: undefined;
};

const Tabs = createBottomTabNavigator<RootTabsParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const AddStack = createNativeStackNavigator<AddStackParamList>();
const ExtraStack = createNativeStackNavigator<ExtraStackParamList>();
const ConfigStack = createNativeStackNavigator<ConfigStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

/** -------------------------
 * UI Helpers
 * -------------------------- */

function homeButton(navigation: any) {
  return (
    <Pressable
      onPress={() => navigation.navigate("HomeTab")}
      style={{ paddingHorizontal: 12, paddingVertical: 6 }}
    >
      <Text style={{ fontWeight: "900", opacity: 0.8 }}>🏠 Menú</Text>
    </Pressable>
  );
}

function stackScreenOptions(): NativeStackNavigationOptions {
  return { headerTitleStyle: { fontWeight: "900" } };
}

/** -------------------------
 * STACKS
 * -------------------------- */

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions()}>
      <HomeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "" }}
      />

      <HomeStack.Screen
        name="DailyBriefing"
        component={DailyBriefingScreen}
        options={({ navigation }) => ({
          title: "Daily Briefing",
          headerRight: () => homeButton(navigation),
        })}
      />

      <HomeStack.Screen
        name="Details"
        component={DetailsScreen}
        options={({ navigation }) => ({
          title: "Detalles",
          headerRight: () => homeButton(navigation),
        })}
      />

      <HomeStack.Screen
        name="PaymentDetails"
        component={PaymentDetailsScreen}
        options={({ navigation }) => ({
          title: "Detalles de pago",
          headerRight: () => homeButton(navigation),
        })}
      />

      {/* ✅ NUEVA PANTALLA DE COBRO / WALLET */}
      <HomeStack.Screen
        name="Charge"
        component={ChargeScreen}
        options={({ navigation }) => ({
          title: "Cobro / Wallet",
          headerRight: () => homeButton(navigation),
        })}
      />

      <HomeStack.Screen
        name="InstrumentSection"
        component={InstrumentSectionScreen}
        options={({ route, navigation }) => ({
          title: route.params.section,
          headerRight: () => homeButton(navigation),
        })}
      />
    </HomeStack.Navigator>
  );
}


function AddStackNav() {
  return (
    <AddStack.Navigator screenOptions={stackScreenOptions()}>
      <AddStack.Screen name="AddStep1" component={AddStep1Screen} options={{ title: "Add +" }} />

      <AddStack.Screen
        name="AddInstruments"
        component={AddInstrumentsScreen}
        options={({ navigation }) => ({
          title: "Instrumentación",
          headerRight: () => homeButton(navigation),
        })}
      />

      <AddStack.Screen
        name="AddPayment"
        component={AddPaymentScreen}
        options={({ navigation }) => ({
          title: "Cobro",
          headerRight: () => homeButton(navigation),
        })}
      />
    </AddStack.Navigator>
  );
}

function ExtraStackNav() {
  return (
    <ExtraStack.Navigator screenOptions={stackScreenOptions()}>
      <ExtraStack.Screen name="Agenda" component={AgendaScreen} options={{ title: "Extra (Agenda)" }} />
    </ExtraStack.Navigator>
  );
}

function ConfigStackNav() {
  return (
    <ConfigStack.Navigator screenOptions={stackScreenOptions()}>
      <ConfigStack.Screen name="Config" component={ConfigScreen} options={{ title: "Configuración" }} />
      <ConfigStack.Screen name="Archive" component={ArchiveScreen} options={{ title: "Archivo" }} />
      <ConfigStack.Screen name="Pendings" component={PendingsScreen} options={{ title: "Pendientes" }} />
    </ConfigStack.Navigator>
  );
}

function TabsNav() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === "HomeTab") iconName = focused ? "home" : "home-outline";
          else if (route.name === "AddTab") iconName = focused ? "add-circle" : "add-circle-outline";
          else if (route.name === "ExtraTab") iconName = focused ? "book" : "book-outline";
          else iconName = focused ? "server" : "server-outline";

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#1E88E5",
        tabBarInactiveTintColor: "gray",
      })}
    >
      <Tabs.Screen name="HomeTab" component={HomeStackNav} options={{ title: "Home" }} />
      <Tabs.Screen name="ConfigTab" component={ConfigStackNav} options={{ title: "Config" }} />
      <Tabs.Screen name="ExtraTab" component={ExtraStackNav} options={{ title: "Extra" }} />
      <Tabs.Screen name="AddTab" component={AddStackNav} options={{ title: "Add" }} />
    </Tabs.Navigator>
  );
}

function AuthStackNav() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Auth" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

/** -------------------------
 * ROOT APP (Gate)
 * -------------------------- */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // null hasta leer AsyncStorage
  const [biometricEnabled, setBiometricEnabledState] = useState<boolean | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  // ✅ Setter global (lo usan tus screens vía Context)
  const setBiometricEnabledGlobal = useCallback(
    async (v: boolean) => {
      await persistBiometricEnabled(v);
      setBiometricEnabledState(v);

      // corta prompts a medias
      setUnlocking(false);

      if (session) {
        if (v === false) {
          setUnlocked(true); // apaga huella => entra directo
        } else {
          setUnlocked(false); // prende huella => vuelve a pedir
        }
      }
    },
    [session]
  );

  // 1) bootstrap: leer sesión + pref biométrica
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const pref = await getBiometricEnabled();
        if (mounted) setBiometricEnabledState(pref);

        const { data, error } = await supabase.auth.getSession();
        if (error) console.warn("[AuthGate] getSession error:", error.message);
        if (mounted) setSession(data.session ?? null);

        // si ya hay sesión y NO hay biometría -> desbloquea directo
        if (mounted && data.session && pref === false) {
          setUnlocked(true);
        }
      } catch (e) {
        console.warn("[AuthGate] bootstrap exception:", e);
      } finally {
        if (mounted) setBooting(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);

      // logout => lock reset total
      if (!nextSession) {
        setUnlocked(false);
        setUnlocking(false);
        return;
      }

      // login/refresh => bloquear para que pase por unlock (si aplica)
      setUnlocked(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 2) Unlock biométrico
  const doUnlock = useCallback(async () => {
    if (!session) return;
    if (biometricEnabled === null) return;

    if (biometricEnabled === false) {
      setUnlocked(true);
      return;
    }

    if (unlocking) return;

    try {
      setUnlocking(true);
      const res = await promptBiometricUnlock();
      if (res?.success) setUnlocked(true);
    } catch (e) {
      console.warn("[Biometric] prompt exception:", e);
    } finally {
      setUnlocking(false);
    }
  }, [session, biometricEnabled, unlocking]);

  // auto-unlock cuando hay sesión y aún no está desbloqueado
  useEffect(() => {
    if (!session) return;
    if (unlocked) return;
    doUnlock();
  }, [session, unlocked, doUnlock]);

  if (booting) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, opacity: 0.7, fontWeight: "700" }}>Cargando…</Text>
      </View>
    );
  }

  return (
    <BiometricProvider
      value={{
        biometricEnabled,
        setBiometricEnabled: setBiometricEnabledGlobal,
      }}
    >
      <NavigationContainer>
        {!session ? (
          <AuthStackNav />
        ) : !unlocked ? (
          <LockScreen onUnlock={doUnlock} />
        ) : (
          <TabsNav />
        )}
      </NavigationContainer>
    </BiometricProvider>
  );
}
