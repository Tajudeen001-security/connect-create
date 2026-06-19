import { Heart, MessageCircle, Share2, Music, Eye } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface ReelCardProps {
  username: string;
  avatarUrl: string;
  videoThumbnail: string;
  caption: string;
  likes: number;
  views: number;
  comments: number;
  musicName?: string;
}

const ReelCard = ({
  username,
  avatarUrl,
  videoThumbnail,
  caption,
  likes,
  views,
  comments,
  musicName,
}: ReelCardProps) => {
  const [liked, setLiked] = useState(false);
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  return (
    <div className="relative h-[calc(100vh-140px)] snap-start bg-background">
      <img
        src={videoThumbnail}
        alt="Reel"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="size-16 rounded-full glass flex items-center justify-center">
          <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-primary border-b-[10px] border-b-transparent ml-1" />
        </div>
      </div>

      {/* Right side actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        <div className="size-10 rounded-full border border-gold\/30 p-[1px]">
          <img src={avatarUrl} alt={username} className="w-full h-full rounded-full object-cover" />
        </div>

        <motion.button
          whileTap={{ scale: 1.3 }}
          onClick={() => setLiked(!liked)}
          className="flex flex-col items-center gap-1"
        >
          <Heart className={`size-7 ${liked ? "fill-red-500 text-red-500" : "text-foreground"}`} />
          <span className="text-[10px] font-semibold">{fmt(likes)}</span>
        </motion.button>

        <button className="flex flex-col items-center gap-1">
          <MessageCircle className="size-7 text-foreground" />
          <span className="text-[10px] font-semibold">{fmt(comments)}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <Share2 className="size-7 text-foreground" />
        </button>

        <button className="flex flex-col items-center gap-1">
          <Eye className="size-6 text-muted-foreground" />
          <span className="text-[10px] font-semibold">{fmt(views)}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-16">
        <p className="font-semibold text-sm text-champagne">@{username}</p>
        <p className="text-sm text-foreground/80 line-clamp-2 mt-1">{caption}</p>
        {musicName && (
          <div className="flex items-center gap-2 mt-2 text-muted-foreground">
            <Music className="size-3" />
            <span className="text-[10px] truncate">{musicName}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReelCard;
