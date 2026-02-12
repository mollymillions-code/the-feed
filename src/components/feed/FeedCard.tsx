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
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function FeedCard({ link, onDelete, onOpen }: FeedCardProps) {
  switch (link.contentType) {
    case "youtube":
      return <YouTubeCard link={link} onDelete={onDelete} onOpen={onOpen} />;
    case "tweet":
      return <TweetCard link={link} onDelete={onDelete} onOpen={onOpen} />;
    case "article":
      return <ArticleCard link={link} onDelete={onDelete} onOpen={onOpen} />;
    case "image":
      return <ImageCard link={link} onDelete={onDelete} onOpen={onOpen} />;
    case "text":
      return <TextCard link={link} onDelete={onDelete} onOpen={onOpen} />;
    default:
      return <GenericCard link={link} onDelete={onDelete} onOpen={onOpen} />;
  }
}
