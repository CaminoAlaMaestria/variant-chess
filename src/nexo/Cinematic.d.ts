declare const Cinematic: (props: {
  name: string;
  skipLabel: string;
  playLabel: string;
  fallback: { title: string; text: string };
  onDone: () => void;
}) => import("react").ReactElement;
export default Cinematic;
