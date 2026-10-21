// Точка входа фронтенда: собирает слои (repository -> service -> controller -> view) и запускает приложение.
import { DUPLICATE_WINDOW_MS, PENDING_MAX_AGE_MS, PENDING_STORAGE_KEY } from './config.js';
import { createKeyboardController } from './controllers/keyboardController.js';
import { createThemeController } from './controllers/themeController.js';
import { createTranslatorController } from './controllers/translatorController.js';
import { createPendingRepository } from './repositories/pendingRepository.js';
import { requestTranslation } from './repositories/translateRepository.js';
import { createDeviceService } from './services/deviceService.js';
import { createPlaybackService } from './services/playbackService.js';
import { createThemeService } from './services/themeService.js';
import { createRecognitionService } from './services/recognitionService.js';
import { createTranslationService } from './services/translationService.js';
import { createDuplicateGuard } from './utils/duplicateGuard.js';
import { createThemeToggleView } from './views/themeToggleView.js';
import { createTranslatorView } from './views/translatorView.js';

// Создаёт все зависимости и инициализирует контроллеры
function bootstrap() {
  // Тип устройства: проставляет data-device/data-screen на <html> и обновляет их при смене условий
  const device = createDeviceService();
  device.apply();
  device.onChange(() => {}); // подписка нужна, чтобы атрибуты обновлялись при повороте экрана или подключении мыши

  // Тема оформления: светлая по умолчанию, тёмная по системной настройке или по выбору пользователя
  createThemeController({ themeService: createThemeService(), toggleView: createThemeToggleView() }).init();

  const view = createTranslatorView();
  const controller = createTranslatorController({
    view,
    recognition: createRecognitionService(),
    playback: createPlaybackService(),
    translation: createTranslationService({ requestTranslation }),
    pending: createPendingRepository({ key: PENDING_STORAGE_KEY, maxAgeMs: PENDING_MAX_AGE_MS }),
    duplicateGuard: createDuplicateGuard(DUPLICATE_WINDOW_MS),
  });
  controller.init();

  // Горячие клавиши работают только на устройствах с мышью и клавиатурой (проверка внутри контроллера)
  createKeyboardController({
    device,
    actions: {
      onMic: side => controller.onMicClick(side),
      onRetry: () => controller.retry(),
      onSwap: () => view.swapLanguages(),
      onEscape: () => controller.onEscape(),
    },
  }).init();
}

bootstrap();
