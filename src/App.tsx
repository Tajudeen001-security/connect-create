import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { FeatureFlagsProvider } from "@/hooks/useFeatureFlags";
import ProtectedRoute from "@/components/ProtectedRoute";
import IncomingCallModal from "@/components/IncomingCallModal";
import VideoCall from "@/components/VideoCall";
import CoHostNotice from "@/components/CoHostNotice";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import SeoCheck from "@/components/SeoCheck";
import CookieConsent from "@/components/CookieConsent";
import WelcomeBackOverlay from "@/components/WelcomeBackOverlay";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PushNotifications } from "@/hooks/usePushNotifications";
import { PushDeepLinkBridge } from "@/components/PushDeepLinkBridge";
import Index from "./pages/Index";
import ReelsPage from "./pages/ReelsPage";
import ChatPage from "./pages/ChatPage";
import ProfilePage from "./pages/ProfilePage";
import CreatePage from "./pages/CreatePage";
import AuthPage from "./pages/AuthPage";
import CoinsPage from "./pages/CoinsPage";
import LivePage from "./pages/LivePage";
import DiscoverPage from "./pages/DiscoverPage";
import NotificationsPage from "./pages/NotificationsPage";
import AIChatPage from "./pages/AIChatPage";
import DirectMessagePage from "./pages/DirectMessagePage";
import UserProfilePage from "./pages/UserProfilePage";
import EditProfilePage from "./pages/EditProfilePage";
import FollowListPage from "./pages/FollowListPage";
import GroupChatPage from "./pages/GroupChatPage";
import EarningsPage from "./pages/EarningsPage";
import AdsPage from "./pages/AdsPage";
import AdminPage from "./pages/AdminPage";
import AdminPushLogsPage from "./pages/AdminPushLogsPage";
import PostDetailPage from "./pages/PostDetailPage";
import GroupDiscoverPage from "./pages/GroupDiscoverPage";
import JoinGroupPage from "./pages/JoinGroupPage";
import DeveloperPage from "./pages/DeveloperPage";
import DeveloperDocsPage from "./pages/DeveloperDocsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

interface ActiveCall {
  remoteUserId: string;
  remoteUserName: string;
  remoteUserAvatar?: string | null;
  callType: "video" | "audio";
  isIncoming: boolean;
}

const AppContent = () => {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

  return (
    <>
      <AnalyticsTracker />
      <SeoCheck />
      <CookieConsent />
      <WelcomeBackOverlay />
      <IncomingCallModal
        onAccept={(call) => setActiveCall({
          remoteUserId: call.callerId,
          remoteUserName: call.callerName,
          remoteUserAvatar: call.callerAvatar,
          callType: call.callType,
          isIncoming: true,
        })}
        onReject={() => {}}
      />
      <CoHostNotice />
      {activeCall && (
        <VideoCall
          remoteUserId={activeCall.remoteUserId}
          remoteUserName={activeCall.remoteUserName}
          remoteUserAvatar={activeCall.remoteUserAvatar}
          callType={activeCall.callType}
          isIncoming={activeCall.isIncoming}
          onEnd={() => setActiveCall(null)}
        />
      )}
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/groups" element={<GroupDiscoverPage />} />
        <Route path="/g/:code" element={<JoinGroupPage />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/reels" element={<ProtectedRoute><ReelsPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><CreatePage /></ProtectedRoute>} />
        <Route path="/coins" element={<ProtectedRoute><CoinsPage /></ProtectedRoute>} />
        <Route path="/live" element={<ProtectedRoute><LivePage /></ProtectedRoute>} />
        <Route path="/discover" element={<ProtectedRoute><DiscoverPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/ai-chat" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
        <Route path="/dm/:userId" element={<ProtectedRoute><DirectMessagePage /></ProtectedRoute>} />
        <Route path="/user/:userId" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
        <Route path="/user/:userId/followers" element={<ProtectedRoute><FollowListPage mode="followers" /></ProtectedRoute>} />
        <Route path="/user/:userId/following" element={<ProtectedRoute><FollowListPage mode="following" /></ProtectedRoute>} />
        <Route path="/edit-profile" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
        <Route path="/group/:groupId" element={<ProtectedRoute><GroupChatPage /></ProtectedRoute>} />
        <Route path="/earnings" element={<ProtectedRoute><EarningsPage /></ProtectedRoute>} />
        <Route path="/ads" element={<ProtectedRoute><AdsPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/admin/push-logs" element={<ProtectedRoute><AdminPushLogsPage /></ProtectedRoute>} />
        <Route path="/post/:postId" element={<ProtectedRoute><PostDetailPage /></ProtectedRoute>} />
        {/* Shareable short link — same view as /post/:id, used by /p/:id when the
            edge OG rewrite isn't reachable so the link always lands on the post. */}
        <Route path="/p/:postId" element={<ProtectedRoute><PostDetailPage /></ProtectedRoute>} />
        <Route path="/developer" element={<ProtectedRoute><DeveloperPage /></ProtectedRoute>} />
        <Route path="/developer/docs" element={<DeveloperDocsPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<PrivacyPolicyPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <FeatureFlagsProvider>
              <PushNotifications />
              <PushDeepLinkBridge />
              <AppContent />
            </FeatureFlagsProvider>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
