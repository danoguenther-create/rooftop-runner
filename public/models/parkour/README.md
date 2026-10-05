# Parkour animation sources

Source: https://github.com/knela96/Dynamic-Parkour-System
Revision: f1ca2c4c0bab9aba9596b4c45e28c2e8cfee9bf1
Directory: Dynamic Parkour System/Assets/Dynamic Parkour System/Model/Animations/
The source repository credits Adobe Mixamo for its animations and model. Its accompanying MIT notice is preserved at ../../licenses/Dynamic-Parkour-System-MIT.txt. These animation clips are used as part of the game, not offered as an independent animation library.

- hang-braced.fbx: Braced Hanging Idle.fbx
- hang-free.fbx: Freehang Idle.fbx
- hang-hop.fbx: Braced Hang Hop Right.fbx
- hang-up.fbx: Braced Hang Hop Up.fbx
- hang-down.fbx: Braced Hang Hop Down.fbx
- hang-drop.fbx: Idle To Braced Hang.fbx
- hang-climb.fbx: Braced Hang Climb.fbx
- hang-shimmy.fbx: Braced Hang Right Shimmy.fbx

AssetLoader remaps skeleton prefixes and removes root translation. PlayerAnimator synchronizes transitions to physics progress; ContactPose adds environmental contacts.
