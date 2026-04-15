import { useEffect, useState } from "react";
import { supabase } from "./supbase-client";
import Auth from "./Auth";
import Dash from "./Dash";
function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // listen for changes
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return <>{session ? <Dash /> : <Auth />}</>;
}

export default App;
