/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  import { FC, SVGProps } from 'react';
  const content: string;
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default content;
  export { ReactComponent };
}