const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceImage = 'C:/Users/user/.gemini/antigravity/brain/05d5fce1-ce5d-422b-9b99-d43f34bd83a8/uploaded_image_1765250728333.jpg';
const androidResDir = 'c:/cartaodepontoapp/app-ponto/android/app/src/main/res';

const iconSizes = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 }
];

// Check if ImageMagick is available (magick or convert)
let magickCmd = 'magick';
try {
    execSync('magick -version');
} catch (e) {
    try {
        execSync('convert -version');
        magickCmd = 'convert';
    } catch (e2) {
        console.error('ImageMagick not found. Please install ImageMagick to generate icons.');
        process.exit(1);
    }
}

console.log(`Using ImageMagick command: ${magickCmd}`);

iconSizes.forEach(icon => {
    const targetDir = path.join(androidResDir, icon.name);
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetFile = path.join(targetDir, 'ic_launcher.png');
    const targetRoundFile = path.join(targetDir, 'ic_launcher_round.png');

    // Generate square icon
    try {
        execSync(`${magickCmd} "${sourceImage}" -resize ${icon.size}x${icon.size} "${targetFile}"`);
        console.log(`Generated ${targetFile}`);
    } catch (e) {
        console.error(`Error generating ${targetFile}:`, e.message);
    }

    // Generate round icon (simple circle crop)
    try {
        // This is a basic circle crop command for ImageMagick
        // convert input.jpg -resize 192x192 \
        // \( +clone -threshold -1 -negate -fill white -draw "circle 96,96 96,0" \) \
        // -alpha off -compose copy_opacity -composite output.png

        const radius = icon.size / 2;
        const center = radius;
        const edge = 0; // Top edge

        // Simplified command for Windows (escaping might be tricky, keeping it simple for now or just using square for round if complex)
        // Let's try a simple resize for round too if circle crop is too complex for cross-platform execSync string
        // Ideally we should crop.

        // Using a simpler approach: just resize for now. Round icons usually need transparency masking.
        // If the user provided a square logo, it will be square in the round icon slot, which is acceptable but not perfect.
        // Let's try to make it round if possible.

        // Windows command escaping for parenthesis is ^( ^)
        // But execSync runs in shell.

        execSync(`${magickCmd} "${sourceImage}" -resize ${icon.size}x${icon.size} "${targetRoundFile}"`);
        console.log(`Generated ${targetRoundFile} (Square fallback)`);

    } catch (e) {
        console.error(`Error generating ${targetRoundFile}:`, e.message);
    }
});

console.log('Icon generation complete.');
