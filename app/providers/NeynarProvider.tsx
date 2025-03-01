"use client";

import { FC, ReactNode } from "react";
import { NeynarContextProvider, Theme } from "@neynar/react";

interface Props {
  children: ReactNode;
}

const NeynarProvider: FC<Props> = ({ children }) => {
  // Get client ID from environment variables
  const clientId = process.env.NEXT_PUBLIC_NEYNAR_CLIENT_ID || "";
  
  console.log("Initializing Neynar provider with client ID:", clientId);

  return (
    <NeynarContextProvider
      settings={{
        clientId: clientId,
        defaultTheme: Theme.Dark,
        eventsCallbacks: {
          onAuthSuccess: (data) => {
            console.log("Neynar auth success with data:", data);
            // You can add additional logic here, like redirecting or setting state
            if (window) {
              window.localStorage.setItem('neynar_auth_success', 'true');
              window.localStorage.setItem('neynar_auth_data', JSON.stringify(data));
            }
          },
          onSignout: () => {
            console.log("Neynar signout event triggered");
            // Handle signout logic
            if (window) {
              window.localStorage.removeItem('neynar_auth_success');
              window.localStorage.removeItem('neynar_auth_data');
            }
          }
        },
      }}
    >
      {children}
    </NeynarContextProvider>
  );
};

export default NeynarProvider; 