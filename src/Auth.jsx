import { useReducer } from "react";
import { supabase } from "./supbase-client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialState = {
  email: "",
  password: "",
  isSignup: true,
  status: "idle", // "idle" | "loading" | "success" | "error"
  message: "",
};

function formReducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "TOGGLE_MODE":
      // Reset entire form when switching between sign-up and sign-in
      return { ...initialState, isSignup: !state.isSignup };
    case "LOADING":
      return { ...state, status: "loading", message: "" };
    case "SUCCESS":
      return { ...state, status: "success", message: action.message };
    case "ERROR":
      return { ...state, status: "error", message: action.message };
    default:
      return state;
  }
}

function validate(email, password) {
  if (!EMAIL_REGEX.test(email.trim())) return "Enter a valid email address.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  return null;
}

export default function Auth() {
  const [state, dispatch] = useReducer(formReducer, initialState);
  const { email, password, isSignup, status, message } = state;

  const isLoading = status === "loading";

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationError = validate(email, password);
    if (validationError) {
      dispatch({ type: "ERROR", message: validationError });
      return;
    }

    dispatch({ type: "LOADING" });

    const credentials = { email: email.trim(), password };

    try {
      const { error } = isSignup
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

      if (error) throw error;

      dispatch({
        type: "SUCCESS",
        message: isSignup
          ? "Account created! Check your email to confirm."
          : "Signed in successfully.",
      });
    } catch (err) {
      dispatch({ type: "ERROR", message: err.message ?? "Something went wrong. Please try again." });
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isSignup ? "Start managing your todos today" : "Sign in to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                disabled={isLoading}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "email", value: e.target.value })
                }
                required
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700
                           text-white placeholder-gray-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder={isSignup ? "Min. 6 characters" : "Enter your password"}
                value={password}
                disabled={isLoading}
                onChange={(e) =>
                  dispatch({ type: "SET_FIELD", field: "password", value: e.target.value })
                }
                required
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700
                           text-white placeholder-gray-500 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors"
              />
            </div>

            {/* Feedback message */}
            {message && (
              <div
                role="alert"
                className={`flex items-start gap-2.5 px-4 py-3 rounded-lg text-sm ${
                  status === "error"
                    ? "bg-red-500/10 border border-red-500/30 text-red-400"
                    : "bg-green-500/10 border border-green-500/30 text-green-400"
                }`}
              >
                {status === "error" ? (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9v4a1 1 0 102 0V9a1 1 0 10-2 0zm1-4a1 1 0 100 2 1 1 0 000-2z"
                      clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd" />
                  </svg>
                )}
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500
                         text-white text-sm font-semibold
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900
                         disabled:opacity-60 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Please wait...
                </span>
              ) : isSignup ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => dispatch({ type: "TOGGLE_MODE" })}
            className="text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50 transition-colors"
          >
            {isSignup ? "Sign in" : "Sign up"}
          </button>
        </p>

      </div>
    </div>
  );
}
