"use client";

import { FeedLink } from "@/types";
import YouTubeCard from "./YouTubeCard";
import TweetCard from "./TweetCard";
import ArticleCard from "./ArticleCard";
import ImageCard from "./ImageCard";
import TextCard from "./TextCard";
import GenericCard from "./GenericCard";

interface FeedCardProps {
  link: FeedLink;
  onDone: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function FeedCard({ link, onDone, onOpen }: FeedCardProps) {
  switch (link.contentType) {
    case "youtube":
      return <YouTubeCard link={link} onDone={onDone} onOpen={onOpen} />;
    case "tweet":
      return <TweetCard link={link} onDone={onDone} onOpen={onOpen} />;
    case "article":
      return <ArticleCard link={link} onDone={onDone} onOpen={onOpen} />;
    case "image":
      return <ImageCard link={link} onDone={onDone} onOpen={onOpen} />;
    case "text":
      return <TextCard link={link} onDone={onDone} onOpen={onOpen} />;
    default:
      return <GenericCard link={link} onDone={onDone} onOpen={onOpen} />;
  }
}
