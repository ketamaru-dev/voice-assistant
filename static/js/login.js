// Точка входа страницы входа: форма авторизации и переключатель темы (та же тема, что и в приложении).
import { createLoginController } from './controllers/loginController.js';
import { createThemeController } from './controllers/themeController.js';
import { authRepository } from './repositories/authRepository.js';
import { createThemeService } from './services/themeService.js';
import { createLoginView } from './views/loginView.js';
import { createThemeToggleView } from './views/themeToggleView.js';

createThemeController({ themeService: createThemeService(), toggleView: createThemeToggleView() }).init();
createLoginController({ view: createLoginView(), auth: authRepository }).init();
