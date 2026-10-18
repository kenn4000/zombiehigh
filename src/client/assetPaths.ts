const HERO_ASSET_MAP: Record<string, string> = {
  'nurse.png': 'anita.jpg',
  'football.png': 'barry.jpg',
  'janitor.png': 'phil.jpg',
  'cheerleader.png': 'elsa.jpg',
  'bully.png': 'brock.jpg',
  'runner.png': 'cia.jpg',
  'bungler.png': 'al.jpg',
  'archy.png': 'archy.jpg',
  'loanwolf.png': 'lola.jpg',
  'principalrich.png': 'richard.jpg',
  'cardshark.png': 'dorothy.jpg',
  'gymcoach.png': 'mike.jpg',
};

const LOCKER_ASSET_MAP: Record<string, string> = {
  'charityfund.jpg': 'charity_fund.jpg',
  'childtool.jpg': 'child_tool_set.jpg',
  'coolsale.png': 'cool_for_sale.jpg',
  'gymsocks.jpg': 'dirty_gym_socks.jpg',
  'dogtag.jpg': 'dog_tags.jpg',
  'freehugs.png': 'free_hugs_tshirt.jpg',
  'freshdress.jpg': 'fresh_wound_dressing.jpg',
  'gasleak.jpg': 'gas_leak.jpg',
  'grappling.png': 'grappling_hook.jpg',
  'leatherjacket.jpg': 'leather_jacket.jpg',
  'longsleeve.png': 'long_sleeves.jpg',
  'nicesale.png': 'nice_for_sale.jpg',
  'ouija.jpg': 'ouija_board.jpg',
  'parttime.jpg': 'part_time_job.jpg',
  'permrecord.jpg': 'permanent_record.jpg',
  'pyramid.jpg': 'pyramid_scheme.jpg',
  'quality.jpg': 'quality_over_quantity.jpg',
  'roller.jpg': 'roller_backpack.jpg',
  'scouttrain.png': 'scout_training.jpg',
  'sharpstick.png': 'sharpened_stick.jpg',
  'shoes.jpg': 'shoes.jpg',
  'vitamins.jpg': 'vitamins.jpg',
  'wallinbox.png': 'wall_in_a_box.jpg',
};

const GAME_ASSET_FILES = [
  'abandoned_notebook.jpg', 'allergies.jpg', 'ambushed.jpg', 'announcement.jpg', 'aplus_student.jpg',
  'area_sabotage.jpg', 'athletic_footwear.jpg', 'atm.jpg', 'attendance_sheet.jpg', 'backpack_search.jpg',
  'backpack_with_supplies.jpg', 'backstage_tunnel.jpg', 'bait_launcher.jpg', 'banned_book.jpg', 'bathroom_trap.jpg',
  'blind_jump.jpg', 'booby_traps.jpg', 'bookmark.jpg', 'book_barriers.jpg', 'book_return_slot.jpg',
  'brass_knuckles.jpg', 'broom_handle.jpg', 'brown_bag_negotiation.jpg', 'change_in_character.jpg', 'cheat_sheet.jpg',
  'check_its_pockets.jpg', 'chicken_dinner.jpg', 'clairvoyance.jpg', 'classic_fiction.jpg', 'class_clown.jpg',
  'class_curve.jpg', 'confident_first_step.jpg', 'copied_notes.jpg', 'cpr_class.jpg', 'cram_session.jpg',
  'crowded_halls.jpg', 'crusty_bandaid.jpg', 'daredevil.jpg', 'death_scent.jpg', 'demerit_slip.jpg',
  'detention_slip.jpg', 'dirty_hall_monitor.jpg', 'dirty_work.jpg', 'disgusting_mess.jpg', 'distraction.jpg',
  'dropped_cash.jpg', 'dropping_a_course.jpg', 'dumpster_diving.jpg', 'embarassment.jpg', 'emergency_retreat.jpg',
  'engineering_club.jpg', 'engineering_exam_key.jpg', 'experiment.jpg', 'extra_movement.jpg', 'failed_project.jpg',
  'first_aid_kit.jpg', 'food_fight.jpg', 'free_trap_pieces.jpg', 'good_science.jpg', 'graffiti.jpg',
  'grave_robber.jpg', 'gymnastics_training.jpg', 'gym_class_hero.jpg', 'hallway_hustler.jpg', 'halo_effect.jpg',
  'hearty_lunch.jpg', 'hidden_report_card.jpg', 'hired_muscle.jpg', 'hole_in_the_ceiling.jpg', 'homerun_bat.jpg',
  'honor_roll.jpg', 'hypnotism.jpg', 'identity_crisis.jpg', 'influencer.jpg', 'in_memory_of.jpg',
  'iron_welding.jpg', 'lab_accident.jpg', 'last_meal.jpg', 'late_paper.jpg', 'leftover_lunch_tray.jpg',
  'long_jump.jpg', 'lunchladys_helper.jpg', 'lunch_from_home.jpg', 'lunch_money.jpg', 'lunch_tray.jpg',
  'mad_dash.jpg', 'mailroom_cart.jpg', 'mental_preparation.jpg', 'mercy.jpg', 'missing_hallpass.jpg',
  'morning_jogging_club.jpg', 'mouth_guard.jpg', 'mr_clean.jpg', 'mystery_meat.jpg', 'newspaper_interview.jpg',
  'nice_guys_finish_last.jpg', 'nice_removal.jpg', 'nobody_saw_that.jpg', 'not_cool_bro.jpg', 'nurses_station.jpg',
  'old_sandwich.jpg', 'one_vs_one.jpg', 'oops.jpg', 'open_locker.jpg', 'panic_run.jpg', 'paramedic_kit.jpg',
  'passed_note.jpg', 'passed_shop_class.jpg', 'pa_announcement.jpg', 'permission_slip.jpg', 'pe_shorts.jpg',
  'photo_lab.jpg', 'physical_exercise.jpg', 'plagiarism.jpg', 'pocket_trap.jpg', 'popularity.jpg',
  'practical_joke.jpg', 'principals_secret.jpg', 'printed_walls.jpg', 'protection_money.jpg', 'recycling_club.jpg',
  'regret.jpg', 'running_jump.jpg', 'saved_you_a_seat.jpg', 'science_kit.jpg', 'scrap_materials.jpg',
  'secret_notes.jpg', 'secret_passage.jpg', 'sell_a_kidney.jpg', 'senior_prank.jpg', 'shop_teachers_pet.jpg',
  'shut_that_door.jpg', 'side_hustle.jpg', 'sincere_thanks.jpg', 'skateboard_accident.jpg', 'skipping_lunch_today.jpg',
  'snack_track.jpg', 'snitch.jpg', 'social_blur.jpg', 'spatial_swap.jpg', 'split_up.jpg', 'spoiled_milk.jpg',
  'sponsorship.jpg', 'spotting_for_a_stranger.jpg', 'staying_awake.jpg', 'stem_club.jpg', 'stolen_wallet.jpg',
  'student_discount.jpg', 'student_of_the_month.jpg', 'study_group.jpg', 'taking_a_bribe.jpg', 'taking_a_nap.jpg',
  'talent_show.jpg', 'teachers_pet.jpg', 'ten_dollar.jpg', 'termite_damage.jpg', 'terror_sprint.jpg',
  'thank_you_note.jpg', 'therapy_group.jpg', 'they_just_keep_coming.jpg', 'time_out.jpg', 'toe_socks.jpg',
  'toolbelt.jpg', 'transfusion.jpg', 'trap_blueprints.jpg', 'trap_flex.jpg', 'triple_jump.jpg', 'under_the_table.jpg',
  'vending_machine.jpg', 'visiting_faculty_id.jpg', 'wall_it_off.jpg', 'water_cooler.jpg', 'well_worn_book.jpg',
  'worn_library_card.jpg', 'zombie_flush.jpg'
];

const GAME_ASSET_ALIAS_INDEX: Record<string, string> = Object.fromEntries(
  GAME_ASSET_FILES.map((file) => [file.toLowerCase().replace(/[^a-z0-9]/g, ''), file])
);

export function resolveAssetPath(
  imageName?: string,
  kind: 'hero' | 'locker' | 'action' | 'game' = 'game',
  cardPlayDiscount: number = 0
): string {
  if (!imageName) {
    return '';
  }

  const cleanName = imageName.split('?')[0].split('#')[0];
  const lowered = cleanName.toLowerCase();

  if (kind === 'hero') {
    const mapped = HERO_ASSET_MAP[lowered];
    return mapped ? `/card-art/herocard_assets/${mapped}` : `/card-art/herocard_assets/${cleanName}`;
  }

  if (kind === 'locker') {
    const mapped = LOCKER_ASSET_MAP[lowered];
    return mapped ? `/card-art/lockercard_assets/${mapped}` : `/card-art/lockercard_assets/${cleanName}`;
  }

  if (kind === 'action') {
    return `/card-art/actioncard_assets/${cleanName}`;
  }

  const normalized = lowered.replace(/[^a-z0-9]/g, '');
  const candidate = GAME_ASSET_ALIAS_INDEX[normalized];
  const discount = Math.max(0, Math.min(3, Math.floor(cardPlayDiscount)));
  const gameAssetFolder = discount > 0 ? `gamecard_assets_${discount}` : 'gamecard_assets';
  if (candidate) {
    return `/card-art/${gameAssetFolder}/${candidate}`;
  }

  return `/card-art/${gameAssetFolder}/${cleanName}`;
}
