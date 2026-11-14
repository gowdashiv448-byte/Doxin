-- Set the default user accent color to blue and update existing users from orange to blue
ALTER TABLE users ALTER COLUMN theme_color SET DEFAULT 'blue';
UPDATE users SET theme_color = 'blue' WHERE theme_color = 'orange';

