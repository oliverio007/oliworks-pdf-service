import * as React from "react";
import { Linking, Pressable, Text, TextProps } from "react-native";

type Props = TextProps & {
  href: string; // antes era Href
  children: React.ReactNode;
};

export function ExternalLink({ href, children, style, ...rest }: Props) {
  return (
    <Pressable
      onPress={async () => {
        try {
          const can = await Linking.canOpenURL(href);
          if (can) await Linking.openURL(href);
        } catch (e) {
          // noop
        }
      }}
    >
      <Text {...rest} style={style}>
        {children}
      </Text>
    </Pressable>
  );
}
