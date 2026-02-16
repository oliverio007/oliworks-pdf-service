// src/dev/DevPanel.tsx
import React from "react";
import { View, Pressable, Text } from "react-native";
import {
  testProjectsSummary,
  testProjectsQuery,
  testWalletSummary,
  testProjectFinancials,
  testArtistsFinancials3,
  testWalletRLSDirect,
  testDailyPlan,
  testArtistProgress,
  testForceResyncProjects, // 👈 AGREGA ESTA
} from "./testers";


import { Alert } from "react-native";



export function DevPanel(props: { testArtistName: string; styles: any }) {
  const s = props.styles;

  return (
    <View style={{ gap: 10, marginTop: 10 }}>
      <Pressable onPress={testProjectsSummary} style={s.smallBtn}>
        <Text style={s.smallBtnText}>Probar projects-summary</Text>
      </Pressable>

<Pressable style={s.button} onPress={testForceResyncProjects}>
  <Text style={s.buttonText}>Resync duro de Projects</Text>
</Pressable>

      <Pressable onPress={testProjectsQuery} style={s.smallBtn}>
        <Text style={s.smallBtnText}>Probar projects-query</Text>
      </Pressable>

    

      <Pressable style={s.button} onPress={testProjectFinancials}>
        <Text style={s.buttonText}>Probar project-financials</Text>
      </Pressable>

      <Pressable style={s.button} onPress={testArtistsFinancials3}>
        <Text style={s.buttonText}>Probar artists-financials3</Text>
      </Pressable>

      <Pressable onPress={testWalletRLSDirect} style={s.smallBtn}>
        <Text style={s.smallBtnText}>Probar wallet RLS (direct)</Text>
      </Pressable>

      <Pressable style={s.button} onPress={testDailyPlan}>
        <Text style={s.buttonText}>Probar daily-plan</Text>
      </Pressable>

      <Pressable onPress={() => testArtistProgress(props.testArtistName)} style={s.smallBtn}>
        <Text style={s.smallBtnText}>Probar avg progreso artista</Text>
      </Pressable>
    </View>
  );
}
