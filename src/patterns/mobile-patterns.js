/**
 * Mobile Application Patterns
 * Architectural and design patterns specific to mobile applications
 */

class MobilePatterns {
  constructor() {
    this.patterns = this._initializePatterns();
  }

  getAllPatterns() {
    return this.patterns;
  }

  selectPatterns(requirements, platform) {
    const selected = {
      architectural: [],
      ui: [],
      data: [],
      navigation: []
    };

    // Select architectural pattern based on complexity
    if (requirements.complexity === 'high') {
      selected.architectural.push(this.patterns.architectural.cleanArchitecture);
    } else if (requirements.complexity === 'medium') {
      selected.architectural.push(this.patterns.architectural.mvvm);
    } else {
      selected.architectural.push(this.patterns.architectural.mvc);
    }

    // Add offline support if needed
    if (requirements.offlineSupport) {
      selected.data.push(this.patterns.data.offlineFirst);
      selected.data.push(this.patterns.data.syncAdapter);
    }

    // Platform-specific patterns
    if (platform === 'ios') {
      selected.architectural.push(this.patterns.architectural.viper);
      selected.ui.push(this.patterns.ui.swiftUI);
    } else if (platform === 'android') {
      selected.architectural.push(this.patterns.architectural.mvp);
      selected.ui.push(this.patterns.ui.compose);
    }

    // Navigation patterns
    if (requirements.navigation === 'complex') {
      selected.navigation.push(this.patterns.navigation.coordinator);
    } else {
      selected.navigation.push(this.patterns.navigation.stack);
    }

    return selected;
  }

  _initializePatterns() {
    return {
      architectural: {
        cleanArchitecture: {
          name: 'Clean Architecture',
          description: 'Layered architecture with dependency inversion',
          layers: {
            presentation: {
              name: 'Presentation Layer',
              components: ['Views', 'ViewModels', 'Presenters'],
              responsibility: 'UI and user interaction'
            },
            domain: {
              name: 'Domain Layer',
              components: ['Use Cases', 'Entities', 'Repository Interfaces'],
              responsibility: 'Business logic and rules'
            },
            data: {
              name: 'Data Layer',
              components: ['Repository Impl', 'Data Sources', 'Mappers'],
              responsibility: 'Data access and external services'
            }
          },
          benefits: ['Testability', 'Separation of concerns', 'Platform independence'],
          implementation: {
            android: 'Modules or packages',
            ios: 'Frameworks or folders'
          }
        },

        mvvm: {
          name: 'MVVM (Model-View-ViewModel)',
          description: 'Data binding pattern for mobile',
          components: {
            model: 'Business data and logic',
            view: 'UI components (Activities, Fragments, Views)',
            viewModel: 'Presentation logic and state',
            binding: 'Data binding (Android) or Combine (iOS)'
          },
          frameworks: {
            android: ['Data Binding', 'View Binding', 'Compose'],
            ios: ['SwiftUI', 'Combine', 'RxSwift']
          }
        },

        viper: {
          name: 'VIPER',
          description: 'iOS architecture pattern',
          components: {
            view: 'UI layer',
            interactor: 'Business logic',
            presenter: 'Presentation logic',
            entity: 'Data models',
            router: 'Navigation logic'
          },
          benefits: ['Highly testable', 'Clear separation', 'Scalable'],
          considerations: ['Complex for small apps', 'Boilerplate code']
        },

        mvp: {
          name: 'MVP (Model-View-Presenter)',
          description: 'Android presentation pattern',
          components: {
            model: 'Data and business logic',
            view: 'UI components (passive)',
            presenter: 'Presentation logic and view updates'
          },
          contract: 'Interface defining view and presenter interaction',
          testing: 'Easy presenter testing without Android framework'
        },

        mvi: {
          name: 'MVI (Model-View-Intent)',
          description: 'Unidirectional data flow',
          components: {
            model: 'Immutable state',
            view: 'UI rendering state',
            intent: 'User actions as intents'
          },
          benefits: ['Predictable state', 'Time-travel debugging', 'Reactive']
        },

        redux: {
          name: 'Redux Architecture',
          description: 'State management for React Native',
          components: {
            store: 'Single source of truth',
            actions: 'State change descriptions',
            reducers: 'Pure state transformation functions',
            middleware: 'Async operations and side effects'
          }
        }
      },

      ui: {
        compose: {
          name: 'Jetpack Compose',
          description: 'Declarative UI for Android',
          features: {
            declarative: 'UI as functions',
            state: 'Reactive state management',
            preview: 'Live preview in IDE',
            animation: 'Built-in animation APIs'
          },
          patterns: ['State hoisting', 'Composition over inheritance']
        },

        swiftUI: {
          name: 'SwiftUI',
          description: 'Declarative UI for iOS',
          features: {
            declarative: 'View as structs',
            combine: 'Reactive framework integration',
            preview: 'Live preview in Xcode',
            propertyWrappers: '@State, @Binding, @ObservedObject'
          }
        },

        responsiveDesign: {
          name: 'Responsive Mobile Design',
          description: 'Adapt to different screen sizes',
          techniques: {
            constraints: 'Auto Layout (iOS) / ConstraintLayout (Android)',
            sizeClasses: 'Compact/Regular size classes',
            orientation: 'Portrait/Landscape handling',
            foldables: 'Support for foldable devices'
          }
        },

        fragments: {
          name: 'Fragment Pattern (Android)',
          description: 'Reusable UI components',
          usage: {
            navigation: 'Navigation component',
            dialogs: 'DialogFragment',
            pager: 'ViewPager with fragments'
          }
        }
      },

      data: {
        offlineFirst: {
          name: 'Offline-First',
          description: 'Local data with sync to server',
          components: {
            localDb: {
              android: 'Room',
              ios: 'Core Data / SQLite',
              crossPlatform: 'Realm / SQLite'
            },
            syncEngine: 'Bidirectional sync logic',
            conflictResolution: 'Last-write-wins or merge',
            queue: 'Offline operation queue'
          },
          sync: {
            strategies: ['Full sync', 'Incremental sync', 'Differential sync'],
            triggers: ['On app start', 'On network available', 'Periodic', 'Manual']
          }
        },

        repository: {
          name: 'Repository Pattern',
          description: 'Abstract data sources',
          implementation: {
            interface: 'Define repository contract',
            local: 'Local data source implementation',
            remote: 'Remote data source implementation',
            cache: 'Memory cache layer'
          },
          benefits: ['Testability', 'Flexibility', 'Single responsibility']
        },

        syncAdapter: {
          name: 'Sync Adapter Pattern',
          description: 'Background data synchronization',
          android: {
            component: 'SyncAdapter',
            features: ['System-managed', 'Battery-efficient', 'Account-based']
          },
          ios: {
            component: 'Background fetch / Processing',
            features: ['Background app refresh', 'Silent push notifications']
          }
        },

        dataBinding: {
          name: 'Data Binding',
          description: 'Bind UI to data sources',
          android: {
            oneWay: 'Observable fields',
            twoWay: 'Two-way data binding',
            expressions: 'Binding expressions in XML'
          },
          ios: {
            combine: 'Combine framework',
            kvo: 'Key-Value Observing',
            rxSwift: 'RxSwift/RxCocoa'
          }
        }
      },

      navigation: {
        stack: {
          name: 'Navigation Stack',
          description: 'Linear navigation flow',
          implementation: {
            android: 'Navigation Component with NavController',
            ios: 'UINavigationController / NavigationView'
          },
          features: ['Back stack management', 'Deep linking', 'Arguments passing']
        },

        tab: {
          name: 'Tab Navigation',
          description: 'Multiple top-level destinations',
          implementation: {
            android: 'BottomNavigationView / TabLayout',
            ios: 'UITabBarController / TabView'
          },
          patterns: ['Preserve state per tab', 'Lazy loading']
        },

        drawer: {
          name: 'Navigation Drawer',
          description: 'Side menu navigation',
          implementation: {
            android: 'DrawerLayout with NavigationView',
            ios: 'Custom implementation / Side menu libraries'
          }
        },

        coordinator: {
          name: 'Coordinator Pattern',
          description: 'Centralized navigation logic',
          components: {
            coordinator: 'Navigation flow controller',
            factory: 'Screen factory',
            router: 'Navigation router'
          },
          benefits: ['Decoupled navigation', 'Reusable flows', 'Deep link handling']
        },

        deepLinking: {
          name: 'Deep Linking',
          description: 'Direct navigation to content',
          types: {
            traditional: 'Custom URL schemes',
            universal: 'Universal Links (iOS) / App Links (Android)',
            deferred: 'Install attribution and routing'
          },
          implementation: {
            routing: 'URL pattern matching',
            parameters: 'Extract and pass parameters',
            fallback: 'Web fallback for uninstalled apps'
          }
        }
      },

      state: {
        bloc: {
          name: 'BLoC Pattern',
          description: 'Business Logic Component for Flutter',
          components: {
            bloc: 'Business logic and state management',
            events: 'User actions and triggers',
            states: 'Application states',
            stream: 'Reactive state updates'
          }
        },

        provider: {
          name: 'Provider Pattern',
          description: 'Dependency injection and state management',
          usage: {
            flutter: 'Provider package',
            android: 'ViewModelProvider',
            ios: 'Environment objects in SwiftUI'
          }
        },

        redux: {
          name: 'Redux for Mobile',
          description: 'Predictable state container',
          implementation: {
            reactNative: 'React-Redux',
            flutter: 'Flutter_Redux',
            native: 'ReSwift (iOS) / Reductor (Android)'
          }
        }
      },

      performance: {
        lazyLoading: {
          name: 'Lazy Loading',
          description: 'Load content on demand',
          techniques: {
            images: 'Load images as needed',
            lists: 'RecyclerView (Android) / UITableView (iOS)',
            modules: 'Dynamic feature modules'
          }
        },

        caching: {
          name: 'Caching Strategy',
          description: 'Multi-level caching',
          levels: {
            memory: 'In-memory LRU cache',
            disk: 'Disk cache for persistence',
            http: 'HTTP cache headers'
          }
        },

        virtualization: {
          name: 'List Virtualization',
          description: 'Efficient list rendering',
          implementation: {
            android: 'RecyclerView with ViewHolder',
            ios: 'UITableView/UICollectionView reuse',
            reactNative: 'FlatList/VirtualizedList'
          }
        }
      },

      security: {
        biometric: {
          name: 'Biometric Authentication',
          description: 'Fingerprint/Face authentication',
          implementation: {
            android: 'BiometricPrompt API',
            ios: 'LocalAuthentication framework'
          }
        },

        keychain: {
          name: 'Secure Storage',
          description: 'Encrypted credential storage',
          implementation: {
            android: 'Android Keystore',
            ios: 'iOS Keychain Services'
          }
        },

        pinning: {
          name: 'Certificate Pinning',
          description: 'SSL/TLS certificate validation',
          implementation: {
            android: 'OkHttp CertificatePinner',
            ios: 'URLSession with pinning'
          }
        }
      }
    };
  }

  getImplementationExample(pattern, platform) {
    const examples = {
      'clean-architecture': {
        android: `
// Use Case
class GetUserUseCase(
    private val repository: UserRepository
) {
    suspend operator fun invoke(userId: String): User {
        return repository.getUser(userId)
    }
}

// Repository Interface (Domain)
interface UserRepository {
    suspend fun getUser(userId: String): User
}

// Repository Implementation (Data)
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserRepository {
    override suspend fun getUser(userId: String): User {
        return try {
            api.getUser(userId).also { dao.insert(it) }
        } catch (e: Exception) {
            dao.getUser(userId) ?: throw e
        }
    }
}`,
        ios: `
// Use Case
class GetUserUseCase {
    private let repository: UserRepository

    init(repository: UserRepository) {
        self.repository = repository
    }

    func execute(userId: String) async throws -> User {
        return try await repository.getUser(userId: userId)
    }
}

// Repository Protocol
protocol UserRepository {
    func getUser(userId: String) async throws -> User
}`
      },

      'offline-first': {
        android: `
// Room Database
@Database(entities = [User::class], version = 1)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
}

// Sync Manager
class SyncManager(
    private val local: UserDao,
    private val remote: UserApi
) {
    suspend fun sync() {
        // Upload local changes
        val pendingChanges = local.getPendingSync()
        pendingChanges.forEach { remote.updateUser(it) }

        // Download remote changes
        val remoteUsers = remote.getUsers()
        local.insertAll(remoteUsers)
    }
}`,
        ios: `
// Core Data + CloudKit
class DataManager {
    lazy var persistentContainer: NSPersistentCloudKitContainer = {
        let container = NSPersistentCloudKitContainer(name: "Model")
        container.loadPersistentStores { _, error in
            if let error = error {
                fatalError("Failed to load store: \\(error)")
            }
        }
        return container
    }()
}`
      }
    };

    return examples[pattern]?.[platform] || '';
  }
}

module.exports = MobilePatterns;