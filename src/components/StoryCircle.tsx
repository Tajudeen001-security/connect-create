interface StoryCircleProps {
  imageUrl: string;
  name: string;
  isAdd?: boolean;
  hasStory?: boolean;
}

const StoryCircle = ({ imageUrl, name, isAdd, hasStory = true }: StoryCircleProps) => {
  return (
    <div className="shrink-0 flex flex-col items-center gap-1.5 cursor-pointer">
      <div
        className={`size-16 rounded-full p-[2px] ${
          hasStory ? "story-ring" : "border border-muted"
        }`}
      >
        <div className="w-full h-full rounded-full bg-onyx p-[2px]">
          {isAdd ? (
            <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-gold text-xl font-light">
              +
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full rounded-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      </div>
      <span className={`text-[10px] uppercase tracking-widest ${isAdd ? "text-gold" : "text-muted-foreground"}`}>
        {name}
      </span>
    </div>
  );
};

export default StoryCircle;
