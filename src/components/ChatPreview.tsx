interface ChatPreviewProps {
  name: string;
  avatarUrl: string;
  lastMessage: string;
  time: string;
  unread?: number;
  isOnline?: boolean;
}

const ChatPreview = ({ name, avatarUrl, lastMessage, time, unread, isOnline }: ChatPreviewProps) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 active:bg-surface transition-colors cursor-pointer">
      <div className="relative shrink-0">
        <div className="size-12 rounded-full border border-gold\/20 p-[1px]">
          <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
        </div>
        {isOnline && (
          <div className="absolute bottom-0 right-0 size-3 rounded-full bg-green-500 border-2 border-background" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <h3 className="text-sm font-semibold text-champagne truncate">{name}</h3>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{time}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{lastMessage}</p>
      </div>
      {unread && unread > 0 && (
        <div className="size-5 rounded-full gold-gradient flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary-foreground">{unread}</span>
        </div>
      )}
    </div>
  );
};

export default ChatPreview;
