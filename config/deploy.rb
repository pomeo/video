#========================
#CONFIG
#========================
set :application, "expressjs4-template"
#========================
#CONFIG
#========================
require           "capistrano-offroad"
offroad_modules   "defaults", "supervisord"
set :repository,  "git@github.com:pomeo/#{application}.git"
set :supervisord_start_group, "app"
set :supervisord_stop_group,  "app"
#========================
#ROLES
#========================
role :app,        "x.x.x.x"

namespace :deploy do
  desc "Symlink shared configs and folders on each release."
  task :symlink_shared do
    run "ln -s #{shared_path}/files #{release_path}/files"
  end
end

after "deploy:create_symlink",
      "deploy:npm_install",
      "deploy:cleanup",
      "deploy:symlink_shared",
      "deploy:restart"
