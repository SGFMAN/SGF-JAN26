import scene1 from "./Scenes/1.png";
import scene2 from "./Scenes/2.png";
import scene3 from "./Scenes/3.png";
import scene4 from "./Scenes/4.png";

/** Play order — 4.png is the first scene when the player enters the game. */
export const SECRET_GAME_SCENES = [
  { id: "3", src: scene3, label: "Scene 3" },
  { id: "1", src: scene1, label: "Scene 1" },
  { id: "2", src: scene2, label: "Scene 2" },
  { id: "4", src: scene4, label: "Scene 4" },
];

export const INITIAL_SCENE_INDEX = 3;

export function getSceneById(sceneId) {
  const id = sceneId != null ? String(sceneId) : null;
  return SECRET_GAME_SCENES.find((scene) => scene.id === id) ?? SECRET_GAME_SCENES[INITIAL_SCENE_INDEX];
}
