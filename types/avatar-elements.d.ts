import type { DetailedHTMLProps, HTMLAttributes } from "react";

type BaseAvatarElementProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  backend?: string;
  "app-id"?: string;
  "user-id"?: string;
  "settings-scope"?: string;
  "settings-group"?: string;
  instance?: string;
};

type AvatarModelElementProps = BaseAvatarElementProps & {
  "avatar-scale"?: string;
  "avatar-vertical-offset"?: string;
};

type AvatarIntrinsicElements = {
  "avatar-model": AvatarModelElementProps;
  "avatar-status": BaseAvatarElementProps;
  "avatar-captions": BaseAvatarElementProps;
  "avatar-settings": BaseAvatarElementProps;
  "avatar-inputs": BaseAvatarElementProps;
};

declare global {
  namespace JSX {
    interface IntrinsicElements extends AvatarIntrinsicElements {}
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends AvatarIntrinsicElements {}
  }
}

export {};
